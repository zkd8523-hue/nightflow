-- ============================================================================
-- Migration 678: 파트너 거절 → 손님 안내 → 손님이 고쳐서 다시 요청 (한국 예약)
--
-- 파트너가 제안서를 거절해도 손님 쪽엔 아무것도 안 보였다 — "내 예약"은 신규/연락함
-- 그대로라 손님은 기다리기만 하고, 운영자가 따로 연락해야 했다(2026-09-30).
--
-- 흐름:
--   1. 파트너 거절(md_response='rejected') → 운영자가 어드민에서 확인
--      (다른 파트너로 돌릴 수도 있어서 거절 즉시 손님에게 자동 발송하지 않는다)
--   2. 운영자가 "손님에게 안내" → guest_notice(손님용 문장)·guest_notice_at 저장 +
--      손님 앱 푸시(없으면 전화번호 신청자에게 문자)
--   3. 손님 "내 예약" 카드에 안내 + [N원으로 다시 요청] / [수정해서 다시 요청] / [취소]
--   4. 다시 요청(/api/booking-rerequest) → md_* 응답과 guest_notice를 지우고 같은
--      파트너에게 제안서 재알림, 운영자에게도 알림
--
-- 손님이 읽는 문장은 운영자가 다듬은 guest_notice뿐이다 — 파트너의 원래 사유
-- (md_reject_reason / md_reject_note)는 운영자용이라 화면에 그대로 내보내지 않는다.
-- 외국인 트랙(foreign_requests)은 손님 로그인이 없어 이번 범위에서 뺐다.
-- ============================================================================

ALTER TABLE korean_booking_requests
  ADD COLUMN IF NOT EXISTS guest_notice TEXT,
  ADD COLUMN IF NOT EXISTS guest_notice_at TIMESTAMPTZ;

COMMENT ON COLUMN korean_booking_requests.guest_notice IS
  '파트너 거절 후 운영자가 손님에게 보낸 안내 문장. 손님이 다시 요청하면 NULL. Migration 678';
COMMENT ON COLUMN korean_booking_requests.guest_notice_at IS
  'guest_notice를 보낸 시각. Migration 678';
