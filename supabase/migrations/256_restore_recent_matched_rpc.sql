-- Migration 256: get_recent_matched_puzzle() RPC를 원래대로 (실제 DB includes 반환).
-- 255에서 하드코딩으로 덮어쓴 걸 되돌리고, 별도로 puzzle_offers.includes 데이터를 직접 UPDATE.

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

-- 해당 오퍼의 includes 데이터 정정.
-- 원본의 "기타" 항목을 실제 브랜드로 교체. extras는 그대로 보존.
UPDATE puzzle_offers
SET includes = ARRAY[
  '모엣 5병',
  '샴페인 1병',
  '데킬라 1병',
  '퍼레이드',
  '전광판',
  '믹서 무제한',
  '생일 이벤트 지원',
  '초메인',
  '입장 전광판'
]
WHERE id = (
  SELECT accepted_offer_id
  FROM puzzles
  WHERE id = 'fdefb3e8-f292-44f8-812d-daba57c2c823'
);
