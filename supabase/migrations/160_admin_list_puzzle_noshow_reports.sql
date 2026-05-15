-- ============================================================================
-- Migration 160: admin 연락 미수신 신고 큐 조회 RPC
-- ============================================================================
-- 배경: /admin/puzzle-noshow-reports 페이지가 client에서 puzzle_offers + puzzles
--       임베드 조회 시, puzzles.puzzle_id가 NOT NULL이라 PostgREST가 자동
--       INNER JOIN을 적용. puzzles RLS가 admin 분기를 평가하지 못하면 행이
--       사라져 카운트(1)와 리스트(0)가 어긋남.
--
-- 해결: SECURITY DEFINER 함수로 RLS를 우회하고 admin 검증을 내부에서 수행.
--       반환 컬럼은 페이지 UI에서 사용하는 필드만.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_list_puzzle_noshow_reports()
RETURNS TABLE (
  id UUID,
  proposed_price INTEGER,
  table_type TEXT,
  visit_marked_at TIMESTAMPTZ,
  visit_requested_at TIMESTAMPTZ,
  puzzle_id UUID,
  puzzle_area TEXT,
  puzzle_event_date DATE,
  leader_id UUID,
  leader_name TEXT,
  leader_display_name TEXT,
  leader_strike_count INTEGER,
  md_id UUID,
  md_name TEXT,
  md_display_name TEXT,
  club_name TEXT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    po.id,
    po.proposed_price,
    po.table_type,
    po.visit_marked_at,
    po.visit_requested_at,
    p.id,
    p.area,
    p.event_date,
    l.id,
    l.name,
    l.display_name,
    l.strike_count,
    m.id,
    m.name,
    m.display_name,
    c.name
  FROM puzzle_offers po
  LEFT JOIN puzzles p ON p.id = po.puzzle_id
  LEFT JOIN users   l ON l.id = p.leader_id
  LEFT JOIN users   m ON m.id = po.md_id
  LEFT JOIN clubs   c ON c.id = po.club_id
  WHERE po.visit_result = 'noshow'
    AND po.strike_applied_at IS NULL
    AND EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  ORDER BY po.visit_marked_at DESC;
$$;

GRANT EXECUTE ON FUNCTION admin_list_puzzle_noshow_reports() TO authenticated;

COMMENT ON FUNCTION admin_list_puzzle_noshow_reports() IS
  'admin이 검토 대기 중인 깃발 연락 미수신 신고 목록을 조회. RLS 우회용.';
