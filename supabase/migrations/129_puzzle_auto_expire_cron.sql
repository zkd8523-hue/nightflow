-- 깃발 자동 만료 (pg_cron) + 부분 인덱스
-- 1분마다 status='open' AND expires_at < now() 인 깃발을 'expired'로 전환

-- pg_cron extension (이미 활성화돼 있을 수 있음)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 부분 인덱스: status='open' row만 인덱싱 → cron UPDATE 풀스캔 방지
-- 만료되어 'expired'로 바뀌면 자동으로 인덱스에서 제외 → 인덱스 크기 자가 관리
CREATE INDEX IF NOT EXISTS idx_puzzles_open_expires_at
  ON puzzles (expires_at)
  WHERE status = 'open';

-- 1분마다 만료 처리
SELECT cron.schedule(
  'expire-puzzles-every-minute',
  '* * * * *',
  $$
  UPDATE puzzles
  SET status = 'expired'
  WHERE status = 'open' AND expires_at < now();
  $$
);

-- 기존 잘못 남은 만료 데이터 일괄 정리 (마이그레이션 1회 실행)
UPDATE puzzles
SET status = 'expired'
WHERE status = 'open' AND expires_at < now();
