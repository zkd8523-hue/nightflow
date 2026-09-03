-- ============================================================================
-- Migration 641: MD 입장 완료 확인 (booking_confirmations.md_checked_in_at)
--
-- 배경: MD용 확인서(BookingPassMd)의 "입장 완료" 버튼이 로컬 React state만
--      바꾸고(setStep("done")) 서버에는 아무것도 저장하지 않았다. 새로고침하면
--      사라지고, 화면엔 "메시지 전송됨"이라고 나오지만 실제로 아무 메시지도
--      안 나갔다. 이 컬럼에 MD가 확인한 시각을 실제로 기록한다.
--
-- 참조: 633_booking_confirmations.sql
-- ============================================================================

ALTER TABLE booking_confirmations
  ADD COLUMN IF NOT EXISTS md_checked_in_at TIMESTAMPTZ;

COMMENT ON COLUMN booking_confirmations.md_checked_in_at IS
  'MD가 "입장 완료" 버튼을 눌러 확인한 시각. NULL이면 아직 미확인.';
