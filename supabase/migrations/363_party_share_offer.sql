-- ============================================================================
-- Migration 363: 조각 채팅방에 오퍼 공유 ("이거 어때요?" 카드)
-- 날짜: 2026-07-02
-- 설명: 오퍼 카드를 채팅에 공유 → 메시지에 shared_offer_id를 달아 카드로 렌더.
-- ============================================================================

ALTER TABLE puzzle_party_messages
  ADD COLUMN IF NOT EXISTS shared_offer_id UUID REFERENCES puzzle_offers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION share_offer_to_party(
  p_puzzle_id UUID,
  p_offer_id  UUID,
  p_content   TEXT DEFAULT '이거 어때요? 👀'
)
RETURNS JSONB AS $$
DECLARE
  v_puzzle      puzzles%ROWTYPE;
  v_msg_id      UUID;
  v_sender_name TEXT;
  v_recipient   RECORD;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF NOT is_party_participant(p_puzzle_id, auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;
  IF v_puzzle.status IN ('expired', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 조각입니다');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM puzzle_offers WHERE id = p_offer_id AND puzzle_id = p_puzzle_id) THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, shared_offer_id)
  VALUES (p_puzzle_id, auth.uid(), COALESCE(NULLIF(btrim(p_content), ''), '이거 어때요? 👀'), p_offer_id)
  RETURNING id INTO v_msg_id;

  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, auth.uid(), now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '멤버')
    INTO v_sender_name FROM users u WHERE u.id = auth.uid();

  FOR v_recipient IN
    SELECT participant_id FROM (
      SELECT leader_id AS participant_id FROM puzzles WHERE id = p_puzzle_id
      UNION SELECT user_id FROM puzzle_members WHERE puzzle_id = p_puzzle_id
      UNION SELECT md_id FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id
    ) parts
    WHERE participant_id <> auth.uid()
  LOOP
    PERFORM notify_user_push(
      v_recipient.participant_id,
      '💬 ' || v_sender_name,
      '오퍼를 공유했어요',
      jsonb_build_object('type', 'party_chat', 'puzzle_id', p_puzzle_id::text),
      '/party/' || p_puzzle_id::text,
      'chat'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION share_offer_to_party(UUID, UUID, TEXT) TO authenticated;
