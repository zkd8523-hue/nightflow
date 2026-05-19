-- ============================================
-- 206: 오늘 조회수 자동 리셋 (pg_cron)
-- 매일 04:00 KST (= 19:00 UTC) 에 reset_today_view_counts() 호출
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 기존 잡 있으면 정리
DO $$
BEGIN
  PERFORM cron.unschedule('reset-today-views-daily');
EXCEPTION WHEN OTHERS THEN
  -- 등록 안되어 있으면 무시
END $$;

SELECT cron.schedule(
  'reset-today-views-daily',
  '0 19 * * *',
  $$ SELECT reset_today_view_counts(); $$
);
