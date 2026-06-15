-- ============================================================================
-- Migration 305: 조각 자동생성 cron 등록
-- 날짜: 2026-06-13
-- 배경:
--   generate-share-listings Edge Function을 pg_cron으로 주기 호출.
--   요일표(share_weekday_plan) 기반 이번 주치 조각을 auctions에 자동 생성.
--
-- 스케줄 (pg_cron은 UTC 기준, KST = UTC+9):
--   1) 매주 월 18:05 KST = 월 09:05 UTC  → '5 9 * * 1'
--      (조각 슬롯 오픈 직후 그 주치 일괄 생성)
--   2) 매일 06:10 KST = 매일 21:10 UTC(전날) → '10 21 * * *'
--      (주중 신규 선점/요일표 변경 반영 + 영업일 새벽6시 경계 이후 그날치 보강)
--   함수는 멱등이라 매일 돌아도 중복 생성 안 됨.
--
-- 참조: 220_restore_expire_puzzles_cron.sql (net.http_post 패턴)
-- ============================================================================

-- 기존 동일 잡 정리 (재적용 안전)
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

-- 1) 매주 월 18:05 KST (09:05 UTC)
SELECT cron.schedule(
  'generate-share-listings-weekly',
  '5 9 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/generate-share-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 2) 매일 06:10 KST (전날 21:10 UTC)
SELECT cron.schedule(
  'generate-share-listings-daily',
  '10 21 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/generate-share-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
