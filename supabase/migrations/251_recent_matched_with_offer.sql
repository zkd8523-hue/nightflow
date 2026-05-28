-- Migration 251: get_recent_matched_puzzle() 확장 — 매치된 클럽명 + 오퍼 includes 포함
-- 비방장에게 공개되는 정보 = 클럽명 + 주류 카테고리(클라이언트에서 브랜드→카테고리 변환)
-- 가격/MD 식별 정보는 여전히 비공개.

-- RETURN 컬럼이 변경되어 DROP 후 재생성 필요
DROP FUNCTION IF EXISTS get_recent_matched_puzzle();

CREATE OR REPLACE FUNCTION get_recent_matched_puzzle()
RETURNS TABLE (
  id UUID,
  area TEXT,
  event_date DATE,
  target_count INT,
  total_budget INT,
  budget_per_person INT,
  notes TEXT,
  matched_at TIMESTAMPTZ,
  club_name TEXT,
  offer_includes TEXT[],
  offer_comment TEXT,
  md_display_name TEXT
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
    p.updated_at AS matched_at,
    c.name AS club_name,
    COALESCE(o.includes, '{}'::TEXT[]) AS offer_includes,
    o.comment AS offer_comment,
    u.display_name AS md_display_name
  FROM puzzles p
  LEFT JOIN puzzle_offers o ON o.id = p.accepted_offer_id
  LEFT JOIN clubs c ON c.id = o.club_id
  LEFT JOIN users u ON u.id = o.md_id
  WHERE p.id = 'fdefb3e8-f292-44f8-812d-daba57c2c823'::UUID
    AND p.status IN ('accepted', 'matched')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_recent_matched_puzzle() TO anon, authenticated;

COMMENT ON FUNCTION get_recent_matched_puzzle() IS
  '최근 매치된 깃발 1건 + 수락된 오퍼의 클럽명/주류 카테고리 반환.';
