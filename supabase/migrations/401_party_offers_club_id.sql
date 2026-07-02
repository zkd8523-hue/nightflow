-- ============================================================================
-- Migration 401: get_party_offers에 club_id 추가 (오퍼 카드 클럽명 → 클럽 상세 링크)
-- 날짜: 2026-07-02
-- Migration 364 본문 + club_id 필드
-- ============================================================================

CREATE OR REPLACE FUNCTION get_party_offers(p_puzzle_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.like_count DESC, t.created_at ASC), '[]'::jsonb)
  FROM (
    SELECT
      o.id                AS offer_id,
      o.md_id             AS md_id,
      o.club_id           AS club_id,
      c.name              AS club_name,
      o.table_type        AS table_type,
      o.proposed_price    AS proposed_price,
      o.includes          AS includes,
      o.comment           AS comment,
      o.status            AS status,
      o.created_at        AS created_at,
      (SELECT count(*) FROM puzzle_offer_votes v WHERE v.offer_id = o.id AND v.vote = 'like')    AS like_count,
      (SELECT count(*) FROM puzzle_offer_votes v WHERE v.offer_id = o.id AND v.vote = 'dislike') AS dislike_count,
      (SELECT v.vote FROM puzzle_offer_votes v WHERE v.offer_id = o.id AND v.user_id = auth.uid()) AS my_vote,
      EXISTS (SELECT 1 FROM puzzle_party_md pm WHERE pm.puzzle_id = p_puzzle_id AND pm.md_id = o.md_id) AS is_invited
    FROM puzzle_offers o
    LEFT JOIN clubs c ON c.id = o.club_id
    WHERE o.puzzle_id = p_puzzle_id
      AND o.status IN ('pending', 'accepted')
      AND is_party_participant(p_puzzle_id, auth.uid())
      AND NOT is_puzzle_md(p_puzzle_id, auth.uid())  -- MD는 경쟁 오퍼 못 봄
  ) t;
$$;
GRANT EXECUTE ON FUNCTION get_party_offers(UUID) TO authenticated;
