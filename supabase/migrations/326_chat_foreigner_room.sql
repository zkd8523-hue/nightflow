-- Migration 326: 외국인 전용 채팅방 추가
-- chat_messages.room CHECK 제약에 'foreigner' 추가

ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_room_check;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_room_check
  CHECK (room IN ('all', 'gangnam', 'hongdae', 'itaewon', 'foreigner'));
