-- Migration 498: get_md_reviews() — 리뷰에 거래 금액 노출
--
-- 배경: /u/[userId] 공개 프로필의 파트너 리뷰 목록에 날짜·금액이 없다는 피드백.
--   - 날짜(created_at)는 이미 RPC가 반환하고 있었음 — 프론트에서 렌더만 안 하고 있었음.
--   - 금액은 puzzle_reviews 테이블 자체엔 없음. 실제 낙찰가는 puzzle_offers.proposed_price에
--     있고, (puzzle_id, md_id) 조합으로 조인된다(101_puzzle_v2_offers.sql:65).
--
-- ⚠️ 초판(작성 시점 기준)이 491의 시그니처를 베이스로 삼았는데, 실제 live 함수는
--    492_review_deletion_request.sql에서 이미 delete_requested_at 컬럼을 추가한 버전이었다.
--    그 사실을 모르고 이 파일을 그대로 적용했으면 delete_requested_at 이 통째로 사라져
--    파트너 "삭제 요청" 버튼 UI가 깨졌을 것 — 적용 전에 발견해서 492 기준으로 다시 작성.
--
-- 반환 컬럼이 바뀌므로(DROP 후 재생성해야 하는 케이스) 492와 동일하게 DROP 후 CREATE.

DROP FUNCTION IF EXISTS get_md_reviews(UUID, INT, INT);
CREATE FUNCTION get_md_reviews(
  p_md_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  rating INT,
  comment TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  club_name TEXT,
  reviewer_id UUID,
  reviewer_display_name TEXT,
  reviewer_profile_image TEXT,
  delete_requested_at TIMESTAMPTZ,
  amount INTEGER
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.rating, r.comment, r.tags, r.created_at,
    c.name AS club_name,
    r.leader_id AS reviewer_id,
    COALESCE(u.display_name, '익명') AS reviewer_display_name,
    u.profile_image AS reviewer_profile_image,
    r.delete_requested_at,
    po.proposed_price AS amount
  FROM puzzle_reviews r
  LEFT JOIN clubs c ON c.id = r.club_id
  LEFT JOIN users u ON u.id = r.leader_id
  LEFT JOIN puzzle_offers po ON po.puzzle_id = r.puzzle_id AND po.md_id = r.md_id
  WHERE r.md_id = p_md_id AND r.status = 'approved'
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50))
  OFFSET GREATEST(0, p_offset);
$$;
GRANT EXECUTE ON FUNCTION get_md_reviews(UUID, INT, INT) TO anon, authenticated;

COMMENT ON FUNCTION get_md_reviews(UUID, INT, INT) IS
  '공개 파트너 리뷰 목록(approved). amount는 puzzle_offers.proposed_price 조인(Migration 498) — 오퍼가 삭제/미존재면 NULL. delete_requested_at은 492에서 추가된 필드 유지.';
