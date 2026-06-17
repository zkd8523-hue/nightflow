-- Migration 312: 푸시/cron 인증을 Vault로 통일
-- 적용일: 2026-06-17
--
-- 배경:
--   app.settings.supabase_url / service_role_key 가 프로덕션 DB에서 NULL이라
--   net.http_post(url := NULL) 로 실패하던 함수/cron 들을 모두
--   vault.decrypted_secrets 에서 인증을 읽도록 통일한다.
--   (notify_admins_push 는 Migration 311 에서 처리)
--
-- 영향 받던 알림(전부 무발송 상태였음):
--   - notify_user_push 경유: 새 오퍼 도착→방장 / 새 깃발→구독MD / 오퍼 수락→MD / 리뷰 요청→방장
--   - cron: generate-share-listings(주간/일간), purge-deleted-accounts
--
-- 전제: Vault 에 'supabase_url', 'service_role_key' 시크릿이 등록돼 있어야 함.

-- ============================================================================
-- 1) notify_user_push (6-arg): 인증을 Vault에서 읽도록 변경
--    (Migration 263 의 app.settings 방식을 대체)
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_user_push(
  p_user_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB,
  p_url TEXT,
  p_category TEXT
)
RETURNS VOID AS $$
DECLARE
  v_url TEXT;
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_body JSONB;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  -- 카테고리 토글 + 방해금지 체크
  IF NOT can_send_push(p_user_id, p_category) THEN
    RETURN;
  END IF;

  -- 인증 정보는 Vault에서 읽는다 (app.settings는 프로덕션에서 NULL)
  SELECT decrypted_secret INTO v_supabase_url     FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO v_service_role_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE NOTICE 'notify_user_push: skipped (vault supabase_url or service_role_key missing)';
    RETURN;
  END IF;

  v_url := v_supabase_url || '/functions/v1/push-dispatch';
  v_body := jsonb_build_object(
    'user_id', p_user_id::TEXT,
    'title', p_title,
    'body', p_body,
    'data', p_data
  );
  IF p_url IS NOT NULL THEN
    v_body := v_body || jsonb_build_object('url', p_url);
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := v_body
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_user_push: net.http_post failed: %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION notify_user_push(UUID, TEXT, TEXT, JSONB, TEXT, TEXT) IS
  'Migration 312: 인증을 Vault에서 읽음. 카테고리/방해금지 체크 유지, 설정 누락·전송 실패 시 조용히 스킵.';

-- ============================================================================
-- 2) cron 잡 재설정: URL 하드코딩 + service_role_key 는 Vault 에서
--    (스케줄은 기존 유지)
-- ============================================================================

-- 2-1) generate-share-listings (주간/일간)
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('generate-share-listings-weekly', 'generate-share-listings-daily')
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'generate-share-listings-weekly',
  '5 9 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/generate-share-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'generate-share-listings-daily',
  '10 21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/generate-share-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 2-2) purge-deleted-accounts (탈퇴 30일 경과 계정 영구삭제, 매일 03:00 UTC)
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE jobname = 'purge-deleted-accounts'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'purge-deleted-accounts',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/purge-deleted-accounts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
