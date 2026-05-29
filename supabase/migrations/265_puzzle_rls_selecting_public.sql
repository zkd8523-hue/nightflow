-- ============================================================================
-- Migration 265: puzzles RLS — selecting(검토 중) 깃발도 공개 SELECT 허용
-- 날짜: 2026-05-29
-- 문제: Migration 097/137/148 정책은 status='open'만 공개 노출.
--       Migration 170에서 추가된 'selecting'(오퍼 마감 후 90분 검토 단계)이
--       leader/관련 MD/admin 외에는 RLS에 의해 필터링되어 홈/깃발 목록에서
--       사라지는 문제. 검토 중 깃발도 카드는 노출(MD CTA는 클라이언트에서 잠금)
--       해 다른 유저가 진행 상황을 볼 수 있게 한다.
-- ============================================================================

DROP POLICY IF EXISTS "View puzzles" ON puzzles;

CREATE POLICY "View puzzles" ON puzzles
  FOR SELECT USING (
    status IN ('open', 'selecting')
    OR leader_id = auth.uid()
    OR id IN (
      SELECT puzzle_id FROM puzzle_offers
      WHERE md_id = auth.uid()
        AND status IN ('pending', 'accepted')
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON POLICY "View puzzles" ON puzzles IS
  'open/selecting 깃발은 누구나, leader/관련 MD는 본인 깃발, admin은 모든 깃발 SELECT 가능.';
