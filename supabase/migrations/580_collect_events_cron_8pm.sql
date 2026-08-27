-- ============================================================================
-- Migration 580: collect-club-events cron → 매일 20:00 KST
--
-- 574 에서 09:00 KST(00:00 UTC)로 걸었던 걸 20:00 KST(11:00 UTC)로 옮긴다
-- (사용자 결정, 2026-08-27). 클럽 게시물은 저녁~밤에 몰려 올라오므로
-- (실측: 수·화·월에 집중, 게시 시각은 19시대가 최다 — peaceful-baking-lightning
-- 플랜 참조) 아침보다 저녁 수집이 그날 올라온 공지를 더 빨리 반영한다.
-- ============================================================================

DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE jobname = 'collect-club-events'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'collect-club-events',
  '0 11 * * *', -- 매일 11:00 UTC = 20:00 KST
  $$
  SELECT net.http_post(
    url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/collect-club-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
