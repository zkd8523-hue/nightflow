-- ============================================================================
-- Migration 458: 깃발(인원 확정) 1인 등록 허용
-- 날짜: 2026-07-12
-- 배경: target_count 최소값이 2로 하드코딩되어 있어 혼자 오는 손님은 깃발을
--       올릴 수 없었음. 클럽 MD 관점에서도 1인 깃발은 매력이 낮아 오퍼가
--       자연스럽게 줄어들 뿐, 강제로 막을 이유는 없음 (시장이 알아서 필터링).
-- 적용: 대시보드 SQL Editor 1회 실행. db push 금지.
-- ============================================================================

ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS puzzles_target_count_check;
ALTER TABLE puzzles ADD CONSTRAINT puzzles_target_count_check CHECK (target_count BETWEEN 1 AND 20);
