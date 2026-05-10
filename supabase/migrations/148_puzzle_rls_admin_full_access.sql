-- Migration 148: puzzles RLS — admin은 모든 깃발 SELECT 가능
-- 137의 정책에 admin 분기가 빠져 있어 admin이 'open' 또는 본인 관련 깃발만 볼 수 있던 문제 수정.

DROP POLICY IF EXISTS "View puzzles" ON puzzles;

CREATE POLICY "View puzzles" ON puzzles
  FOR SELECT USING (
    status = 'open'
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
  'open 깃발은 누구나, leader/관련 MD는 본인 깃발, admin은 모든 깃발 SELECT 가능.';
