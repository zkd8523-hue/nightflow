-- ============================================================================
-- Migration 571: collect-club-events cron 주 2회 → 주 1회
-- 날짜: 2026-08-26
-- 배경:
--   564에서 수·금 주 2회로 걸었는데, 이후 감시 대상을 힙합 30곳에서 인스타 보유
--   클럽 전체(~100곳)로 넓히면서 호출량이 3배 이상 늘었다. Apify 무료 크레딧은
--   월 $5뿐이고 실제로 하루 만에 소진된 적이 있다($5.01/$5.00, 이후 계정 전체가
--   'Monthly usage hard limit exceeded'로 잠김).
--
--   깊이(POSTS_PER_CLUB)도 8→3으로 줄였고, 여기서 주기까지 1회로 낮춰
--   월 ~1,200건(약 $2.8) 수준으로 맞춘다.
--
--   수요일 09:00 KST를 남기는 이유: 큐레이션 계정 주간 게시가 올라온 뒤이면서
--   주말(금·토) 공연 전이라, 한 번만 돌릴 거면 이 시점이 가장 많이 건진다.
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
  '0 0 * * 3',
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
