-- ============================================================================
-- Migration 137: puzzles RLS — MD가 자신이 오퍼를 보낸 퍼즐을 항상 읽을 수 있도록
-- 날짜: 2026-05-07
-- 문제: 퍼즐 수락 후 status='accepted'로 바뀌면 기존 정책(status='open' OR leader_id)으로
--       MD가 puzzle 행을 읽을 수 없어 대시보드 카드가 null 렌더링됨
-- ============================================================================

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
  );
