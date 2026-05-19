-- 깃발 리스트 소셜프루프 배너 지원
-- 1) users.is_test 컬럼 추가 (테스트 계정 마킹)
-- 2) 최근 30일 cancelled 깃발 3개 이상 만든 leader 자동 마킹 (휴리스틱)
-- 3) get_puzzle_social_proof RPC: 최근 14일 진짜 깃발/오퍼 수 반환

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_is_test ON users(is_test) WHERE is_test = true;

-- 휴리스틱: 최근 30일 cancelled 3개 이상이면 테스트 계정으로 추정
UPDATE users u
SET is_test = true
WHERE u.id IN (
  SELECT p.leader_id
  FROM puzzles p
  WHERE p.created_at >= now() - interval '30 days'
    AND p.status = 'cancelled'
  GROUP BY p.leader_id
  HAVING COUNT(*) >= 3
);

CREATE OR REPLACE FUNCTION get_puzzle_social_proof()
RETURNS TABLE(puzzle_count BIGINT, offer_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH real_puzzles AS (
    SELECT p.id
    FROM puzzles p
    JOIN users u ON u.id = p.leader_id
    WHERE p.created_at >= now() - interval '14 days'
      AND p.status <> 'cancelled'
      AND COALESCE(u.is_test, false) = false
  )
  SELECT
    (SELECT COUNT(*) FROM real_puzzles)::BIGINT AS puzzle_count,
    (SELECT COUNT(*) FROM puzzle_offers po
       WHERE po.created_at >= now() - interval '14 days'
         AND po.puzzle_id IN (SELECT id FROM real_puzzles)
    )::BIGINT AS offer_count;
$$;

GRANT EXECUTE ON FUNCTION get_puzzle_social_proof() TO anon, authenticated;
