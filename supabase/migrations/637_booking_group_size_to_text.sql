-- ============================================================================
-- Migration 637: confirmed_group_size를 TEXT로 변경
--
-- 배경: INTEGER로 만들었더니 "8~15" 같은 범위 표기를 입력할 수 없었다.
--      확정 인원은 정확한 숫자 하나가 아니라 "8~15명" 처럼 자리 여유를
--      감안한 범위로 적는 경우가 실제로 있다.
--
-- 순서 주의: CHECK 제약을 먼저 지워야 한다. ALTER TYPE을 먼저 하면 기존
-- CHECK(confirmed_group_size > 0)를 새 타입(TEXT)에 재적용하려다가
-- "text > integer" 연산자가 없어서 실패한다.
--
-- 참조: 636_booking_confirmed_group_size.sql
-- ============================================================================

ALTER TABLE booking_confirmations
  DROP CONSTRAINT IF EXISTS booking_confirmations_confirmed_group_size_check;

ALTER TABLE booking_confirmations
  ALTER COLUMN confirmed_group_size TYPE TEXT USING confirmed_group_size::TEXT;

COMMENT ON COLUMN booking_confirmations.confirmed_group_size IS
  '확정 인원. 자유 텍스트(예: "10명", "8~15명"). NULL이면 foreign_requests.group_size를 그대로 사용.';
