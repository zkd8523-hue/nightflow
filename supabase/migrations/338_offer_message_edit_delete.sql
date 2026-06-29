-- ============================================================================
-- Migration 338: 오퍼 채팅 메시지 수정/삭제 (본인 메시지만)
-- puzzle_offer_messages 는 이미 Realtime publication 포함 → UPDATE 이벤트 전파됨
-- ============================================================================

ALTER TABLE puzzle_offer_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 수정: 본인·미삭제 메시지의 텍스트 교체 + edited_at 기록
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION edit_offer_message(p_message_id UUID, p_content TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_msg puzzle_offer_messages;
BEGIN
  SELECT * INTO v_msg FROM puzzle_offer_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '메시지를 찾을 수 없어요');
  END IF;
  IF v_msg.sender_id <> v_uid THEN
    RETURN json_build_object('success', false, 'error', '본인 메시지만 수정할 수 있어요');
  END IF;
  IF v_msg.is_deleted THEN
    RETURN json_build_object('success', false, 'error', '삭제된 메시지예요');
  END IF;
  IF p_content IS NULL OR char_length(trim(p_content)) = 0 THEN
    RETURN json_build_object('success', false, 'error', '내용을 입력해주세요');
  END IF;
  IF char_length(p_content) > 500 THEN
    RETURN json_build_object('success', false, 'error', '500자를 넘을 수 없어요');
  END IF;

  UPDATE puzzle_offer_messages
  SET content = trim(p_content), edited_at = now()
  WHERE id = p_message_id;

  RETURN json_build_object('success', true);
END; $$;

-- ----------------------------------------------------------------------------
-- 삭제: 본인 메시지 soft-delete (내용·미디어 비움)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_offer_message(p_message_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_msg puzzle_offer_messages;
BEGIN
  SELECT * INTO v_msg FROM puzzle_offer_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '메시지를 찾을 수 없어요');
  END IF;
  IF v_msg.sender_id <> v_uid THEN
    RETURN json_build_object('success', false, 'error', '본인 메시지만 삭제할 수 있어요');
  END IF;

  UPDATE puzzle_offer_messages
  SET is_deleted = true, content = '', media = '[]'::jsonb
  WHERE id = p_message_id;

  RETURN json_build_object('success', true);
END; $$;

GRANT EXECUTE ON FUNCTION edit_offer_message(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_offer_message(UUID)     TO authenticated;
