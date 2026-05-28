-- Migration 253: get_recent_matched_puzzle() — MD instagram 핸들 추가 (클릭 비활성, 표시 전용)

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
  md_display_name TEXT,
  md_instagram TEXT
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
    u.display_name AS md_display_name,
    u.instagram AS md_instagram
  FROM puzzles p
  LEFT JOIN puzzle_offers o ON o.id = p.accepted_offer_id
  LEFT JOIN clubs c ON c.id = o.club_id
  LEFT JOIN users u ON u.id = o.md_id
  WHERE p.id = 'fdefb3e8-f292-44f8-812d-daba57c2c823'::UUID
    AND p.status IN ('accepted', 'matched')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_recent_matched_puzzle() TO anon, authenticated;
