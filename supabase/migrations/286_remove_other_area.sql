-- Migration 286: 채팅방에서 '다른 지역(other)' 제거
-- - 기존 area='other' 데이터 모두 삭제
-- - CHECK 제약을 강남/홍대/이태원만으로 축소

-- ============================================
-- 1) 기존 other 데이터 정리
-- ============================================
DELETE FROM area_verifications WHERE area = 'other';
DELETE FROM chat_messages WHERE room = 'other' OR author_area = 'other';

-- ============================================
-- 2) area_verifications CHECK 제약 갱신
-- ============================================
ALTER TABLE area_verifications
  DROP CONSTRAINT IF EXISTS area_verifications_area_check;
ALTER TABLE area_verifications
  ADD CONSTRAINT area_verifications_area_check
  CHECK (area IN ('gangnam', 'hongdae', 'itaewon'));

-- ============================================
-- 3) chat_messages.room CHECK 제약 갱신
-- ============================================
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_room_check;
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_room_check
  CHECK (room IN ('all', 'gangnam', 'hongdae', 'itaewon'));

-- ============================================
-- 4) chat_messages.author_area CHECK 제약 갱신
-- ============================================
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_author_area_check;
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_author_area_check
  CHECK (author_area IS NULL OR author_area IN ('gangnam', 'hongdae', 'itaewon'));
