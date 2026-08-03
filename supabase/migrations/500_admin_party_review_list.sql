-- ============================================================================
-- Migration 500: 어드민 파티 상호리뷰 개별 목록 (누가 누구에게)
-- 날짜: 2026-07-20
-- 설명:
--   admin_party_review_stats()는 집계만 보여줌. 실제 "누가 누구에게 👍/태그를
--   남겼는지" 개별 행을 확인할 수 있도록 목록 RPC 추가.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_list_party_reviews(p_limit INT DEFAULT 100)
RETURNS TABLE (
  id UUID,
  puzzle_id UUID,
  area TEXT,
  event_date DATE,
  reviewer_id UUID,
  reviewer_name TEXT,
  reviewee_id UUID,
  reviewee_name TEXT,
  liked BOOLEAN,
  tags TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.puzzle_id, p.area, p.event_date::DATE,
    r.reviewer_id, COALESCE(ru.display_name, '익명'),
    r.reviewee_id, COALESCE(eu.display_name, '익명'),
    r.liked, r.tags, r.created_at
  FROM puzzle_member_reviews r
  LEFT JOIN puzzles p ON p.id = r.puzzle_id
  LEFT JOIN users ru ON ru.id = r.reviewer_id
  LEFT JOIN users eu ON eu.id = r.reviewee_id
  WHERE EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;
GRANT EXECUTE ON FUNCTION admin_list_party_reviews(INT) TO authenticated;
