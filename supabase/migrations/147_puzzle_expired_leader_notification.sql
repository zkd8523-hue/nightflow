-- 깃발 만료 시 leader에게 인앱 알림 발송
-- Migration 129의 cron job을 함수 기반으로 재정의:
--   1) status='open' AND expires_at < now() → 'expired' UPDATE
--   2) RETURNING된 row마다 in_app_notifications INSERT
-- 단일 트랜잭션 + UPDATE의 status='open' 조건으로 멱등성 자연 확보 (재실행 시 0행 매치).

CREATE OR REPLACE FUNCTION notify_and_expire_puzzles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE puzzles
    SET status = 'expired'
    WHERE status = 'open' AND expires_at < now()
    RETURNING id, leader_id, area, event_date, notes
  ),
  inserted AS (
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    SELECT
      leader_id,
      'puzzle_expired_leader',
      '깃발이 만료됐어요',
      COALESCE(NULLIF(notes, ''), area || ' ' || to_char(event_date, 'MM/DD'))
        || ' 깃발의 시간이 끝났습니다. 결과를 확인해보세요.',
      '/bids?tab=puzzle'
    FROM expired
    WHERE leader_id IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM expired;

  RETURN v_count;
END;
$$;

-- 기존 129의 cron job을 새 함수로 교체
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'expire-puzzles-every-minute';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'expire-puzzles-every-minute',
  '* * * * *',
  $$SELECT notify_and_expire_puzzles()$$
);

-- 마이그레이션 1회: 이미 만료됐어야 할 깃발 즉시 정리 + 알림 발송
SELECT notify_and_expire_puzzles();

COMMENT ON FUNCTION notify_and_expire_puzzles() IS
  '만료된 깃발(status=open, expires_at<now)을 expired로 전환하고 leader에게 인앱 알림 발송. pg_cron이 1분마다 호출.';
