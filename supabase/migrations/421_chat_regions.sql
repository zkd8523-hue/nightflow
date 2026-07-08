-- Migration 421: 와글 채팅방 광역 재편 (수도권/경상권/전라권) + 지역 인증 제거
--
-- 변경:
--   1) room CHECK에 광역 코드 추가 (레거시 코드는 데이터 이관 후에도 CHECK엔 유지 — 안전)
--   2) 기존 메시지(all/gangnam/hongdae/itaewon/other) → 'sudogwon'(수도권)으로 이관
--      (기존 채팅은 사실상 서울 통합방이었으므로 수도권으로 흡수)
--   3) INSERT RLS에서 지역 인증(has_active_area_verification) 요구 제거
--      → 로그인만 하면 누구나 어느 광역방이든 쓰기 가능

-- 1) CHECK 제약 갱신 (기존 제약명 자동 탐색 대신, 재정의)
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_room_check;
-- 기존 데이터 이관을 먼저 하려면 CHECK가 새 값을 허용해야 하므로, 넓은 CHECK를 먼저 건다.
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_room_check
  CHECK (room IN ('all','gangnam','hongdae','itaewon','other','sudogwon','gyeongsang','jeolla'));

-- 2) 기존 메시지 → 수도권 이관 (서울 통합방 흡수)
UPDATE chat_messages
  SET room = 'sudogwon'
  WHERE room IN ('all','gangnam','hongdae','itaewon','other');

-- 3) INSERT RLS: 지역 인증 요구 제거 (로그인 = 작성자 본인이면 허용)
DROP POLICY IF EXISTS "Verified users can write chat" ON chat_messages;
DROP POLICY IF EXISTS "Anyone logged in can write chat" ON chat_messages;
CREATE POLICY "Anyone logged in can write chat"
  ON chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() = author_id);

COMMENT ON CONSTRAINT chat_messages_room_check ON chat_messages IS
  'Migration 421: 광역방(sudogwon/gyeongsang/jeolla) + 레거시 코드 허용.';
