-- Migration 249: get_recent_matched_puzzle()
-- 익명/일반 유저도 호출 가능한 RPC. 가장 최근 매치된 깃발 1건의 공개 가능 필드만 반환.
-- RLS 우회를 위해 SECURITY DEFINER 사용. 노출 필드는 area/target_count/event_date 등 식별 위험 없는 메타만.

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
  WHERE p.status IN ('accepted', 'matched')
  ORDER BY p.updated_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_recent_matched_puzzle() TO anon, authenticated;

COMMENT ON FUNCTION get_recent_matched_puzzle() IS
  '최근 매치된 깃발 1건의 공개 가능 필드만 반환. 신뢰 표시용. 익명 호출 허용.';
