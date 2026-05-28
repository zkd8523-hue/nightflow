-- Migration 250: get_recent_matched_puzzle() 화이트리스트 적용
-- 현재 매치된 깃발은 대부분 admin 테스트 데이터.
-- 실제 유저 매치(거누달려)만 신뢰 표시용으로 노출.
-- Phase 2: 신규 매치 누적되면 status + role 기반 필터로 전환 예정.

CREATE OR REPLACE FUNCTION get_recent_matched_puzzle()
RETURNS TABLE (
  id UUID,
  area TEXT,
  event_date DATE,
  target_count INT,
  total_budget INT,
  budget_per_person INT,
  notes TEXT,
  matched_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.area::TEXT,
    p.event_date,
    p.target_count,
    p.total_budget,
    p.budget_per_person,
    p.notes,
    p.updated_at AS matched_at
  FROM puzzles p
  WHERE p.id = 'fdefb3e8-f292-44f8-812d-daba57c2c823'::UUID
    AND p.status IN ('accepted', 'matched')
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_recent_matched_puzzle() IS
  '최근 매치된 깃발 1건 반환 (현재 화이트리스트 운영). 실제 유저 매치만 노출.';
