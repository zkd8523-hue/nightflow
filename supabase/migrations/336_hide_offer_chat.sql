-- ============================================================================
-- Migration 336: 종료된 대화 삭제(숨기기) RPC
-- 날짜: 2026-06-29
-- 설명:
--   종료된 오퍼(expired/rejected/withdrawn) 대화를 본인 목록에서 삭제.
--   참여자별 소프트 숨김(leader_chat_hidden_at / md_chat_hidden_at, Migration 332에서 추가).
--   진행 중/매칭된 대화는 삭제 불가.
--   ※ 컬럼 + get_offer_chats 필터는 332에 있음 → 332 재적용 후 이 336 적용.
-- ============================================================================
CREATE OR REPLACE FUNCTION hide_offer_chat(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer  puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '대화를 찾을 수 없습니다');
  END IF;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;

  -- 종료된 대화만 삭제 가능
  IF v_offer.status NOT IN ('expired', 'rejected', 'withdrawn') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 대화만 삭제할 수 있습니다');
  END IF;

  IF auth.uid() = v_puzzle.leader_id THEN
    UPDATE puzzle_offers SET leader_chat_hidden_at = now() WHERE id = p_offer_id;
  ELSIF auth.uid() = v_offer.md_id THEN
    UPDATE puzzle_offers SET md_chat_hidden_at = now() WHERE id = p_offer_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION hide_offer_chat(UUID) TO authenticated;
