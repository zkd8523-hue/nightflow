-- ============================================================================
-- Migration 636: 확정 인원 (booking_confirmations.confirmed_group_size)
--
-- 배경: 손님이 처음 신청할 때 적은 인원(foreign_requests.group_size)이 확정
--      단계에서 바뀌는 경우가 있는데(예: 10명 → 8명으로 조정), 이걸 담을
--      칸이 없어 확인서에 계속 신청 당시 인원만 표시됐다.
--
-- total_price와 동일한 패턴: 희망(group_size)과 확정(confirmed_group_size)을
-- 분리해 저장한다. NULL이면 요청 원본 인원을 그대로 쓴다.
--
-- 참조: 633_booking_confirmations.sql
-- ============================================================================

ALTER TABLE booking_confirmations
  ADD COLUMN IF NOT EXISTS confirmed_group_size INTEGER
    CHECK (confirmed_group_size IS NULL OR confirmed_group_size > 0);

COMMENT ON COLUMN booking_confirmations.confirmed_group_size IS
  '확정 인원. NULL이면 foreign_requests.group_size(요청 당시 인원)를 그대로 사용.';
