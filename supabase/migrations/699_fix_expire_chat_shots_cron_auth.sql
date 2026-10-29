-- ============================================================================
-- Migration 699: expire-chat-shots 크론 인증을 Vault로 교체
-- 날짜: 2026-10-30
--
-- 증상: 30분마다 호출이 401 UNAUTHORIZED_NO_AUTH_HEADER로 실패 (net._http_response 확인).
-- 원인: 크론 명령이 current_setting('app.settings.service_role_key', true)를 쓰는데
--       프로덕션에서 이 값이 NULL이라 Authorization 헤더가 통째로 빠진다
--       (Migration 312과 같은 원인 — 그때 다른 크론만 고치고 이 크론은 빠졌다).
-- 영향: 만료된 chat_shots가 한 번도 정리되지 않았다.
--       2026-10-30 기준 30건 전부 만료 상태로 남아 있음(가장 오래된 만료 2026-06-22).
--       함수가 살아나면 이 30건과 스토리지 파일이 첫 실행에서 삭제된다(설계된 동작).
--
-- 전제: Vault에 'service_role_key' 시크릿이 있어야 함 (notify_user_push가 이미 사용 중).
-- ============================================================================

DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE jobname = 'expire-chat-shots-every-30min'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'expire-chat-shots-every-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/expire-chat-shots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
