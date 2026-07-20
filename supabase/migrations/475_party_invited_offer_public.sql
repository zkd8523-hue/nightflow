-- ============================================================================
-- Migration 475: 조각 "상담중" 배지를 방장 외 비방장/외부 뷰에도 노출
-- 날짜: 2026-07-21
-- 배경:
--   깃발은 puzzle_offers.leader_chat_started_at이 공개 컬럼이라 비방장도 "상담중" 배지를 봄.
--   조각은 단체채팅 초대 여부가 puzzle_party_md에 있는데, 이 테이블 RLS가
--   is_party_participant(방장/멤버/초대된 MD 본인)로 제한돼 있어 비방장·외부 유저는 조회 불가.
--   → offer_id만 반환하는 최소 공개 RPC로 우회 (md_id 등 PII는 노출 안 함).
-- ============================================================================

CREATE OR REPLACE FUNCTION get_party_invited_offer_id(p_puzzle_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT offer_id FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
$$;

GRANT EXECUTE ON FUNCTION get_party_invited_offer_id(UUID) TO anon, authenticated;
