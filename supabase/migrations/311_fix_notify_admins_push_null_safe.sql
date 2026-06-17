-- Migration 311: notify_admins_push() 인증을 Vault에서 읽도록 수정
-- 문제: Migration 164의 notify_admins_push()는 app.settings.supabase_url /
--       service_role_key 를 읽었는데, 프로덕션에서 둘 다 NULL이라
--       net.http_post(url := NULL)로 실패 → 신규 깃발 등 admin 푸시가 전달 안 됨.
-- 수정: 인증 정보를 vault.decrypted_secrets('supabase_url','service_role_key')에서 읽는다.
--       (notify_user_push, cron 잡들도 동일 방식으로 통일 — Migration 312 참조)
-- 적용일: 2026-06-17

CREATE OR REPLACE FUNCTION notify_admins_push(
  p_title TEXT,
  p_body  TEXT,
  p_data  JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID AS $$
DECLARE
  v_admin           RECORD;
  v_supabase_url    TEXT;
  v_service_role_key TEXT;
  v_url             TEXT;
BEGIN
  SELECT decrypted_secret INTO v_supabase_url     FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO v_service_role_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE NOTICE 'notify_admins_push: skipped (vault supabase_url or service_role_key missing)';
    RETURN;
  END IF;

  v_url := v_supabase_url || '/functions/v1/push-dispatch';

  FOR v_admin IN
    SELECT id FROM users
    WHERE role = 'admin' AND deleted_at IS NULL
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body    := jsonb_build_object(
          'user_id', v_admin.id::TEXT,
          'title',   p_title,
          'body',    p_body,
          'data',    p_data
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'notify_admins_push: net.http_post failed for admin %: %', v_admin.id, SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION notify_admins_push(TEXT, TEXT, JSONB) IS
  'Migration 311: 인증을 Vault에서 읽음. app.settings 누락 시 조용히 스킵, net.http_post 실패도 호출자에 전파 X.';
