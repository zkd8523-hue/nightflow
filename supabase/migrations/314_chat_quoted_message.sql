-- Migration 314: 와글 메시지 인용 공유
-- - 다른 방으로 공유 시 원본 메시지 출처 표시용
-- - 원본 삭제 시 quoted_message_id는 NULL로 (인용 박스에 "원본 삭제됨" 표시)

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS quoted_message_id UUID
    REFERENCES chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_quoted
  ON chat_messages(quoted_message_id)
  WHERE quoted_message_id IS NOT NULL;

COMMENT ON COLUMN chat_messages.quoted_message_id IS
  '인용 공유: 다른 방으로 공유한 메시지의 원본 ID. NULL이면 일반 메시지.';
