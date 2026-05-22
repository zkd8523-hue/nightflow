-- ============================================================================
-- Migration 220: expire-puzzles cron 복구
-- 날짜: 2026-05-22
-- 설명:
--   Migration 147에서 등록한 'expire-puzzles-every-minute' cron은
--   `SELECT notify_and_expire_puzzles()`를 호출하는데,
--   Migration 197에서 해당 함수를 DROP하면서 cron job은 재스케줄하지 않았음.
--   결과: 자동 만료(open→selecting, open/selecting→expired)가 멈춤.
--
--   책임이 Edge Function `expire-puzzles`로 이관됐으므로,
--   pg_cron이 매분 Edge Function을 HTTP 호출하도록 재등록한다.
--
--   동시에 누적된 만료 깃발을 인라인으로 한 번 정리한다.
-- ============================================================================

-- 1) 기존 cron job 정리 (notify_and_expire_puzzles 호출하던 잔재)
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'expire-puzzles-every-minute';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

-- 2) Edge Function을 호출하는 cron으로 재등록 (매분)
SELECT cron.schedule(
  'expire-puzzles-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/expire-puzzles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3) 인라인 즉시 정리: 누적된 깃발을 한 번에 만료 처리
--    Edge Function이 처음 돌 때까지 기다리지 않도록 안전망.
--    (open → selecting: offer_deadline 도래분만, selecting → expired: expires_at 도래분)

-- (a) open → selecting
UPDATE puzzles
   SET status = 'selecting'
 WHERE status = 'open'
   AND offer_deadline IS NOT NULL
   AND offer_deadline <= now()
   AND expires_at > now();

-- (b) open/selecting → expired
UPDATE puzzles
   SET status = 'expired'
 WHERE status IN ('open', 'selecting')
   AND expires_at <= now();
