-- ============================================================================
-- Migration 611: foreign_requests.guest_name — 예약 대표자 성명
--
-- 배경: 예약 확인서를 발행하려면 입구에서 확인할 이름이 필요한데, 폼에 이름 칸이
--      없어서 운영자가 매번 따로 물어봐야 했다. 이메일 앞부분(jinhong9741)에서
--      유추하는 건 대부분 틀린다.
--
-- 업계 표준(OTA_HotelResNotifRQ / SiteMinder pmsXchange)에서 투숙객 성명
-- (ResGuest/PersonName)은 mandatory. 날짜·인원과 동급 필수값이다.
--
-- 참조: 454_foreign_requests.sql (테이블 생성), 489 (익명 신청 허용)
-- ============================================================================

ALTER TABLE foreign_requests
  ADD COLUMN IF NOT EXISTS guest_name TEXT;

COMMENT ON COLUMN foreign_requests.guest_name IS
  '예약 대표자 성명. 입구에서 확인하는 이름 — 여권/신분증 표기 기준. 기존 행은 NULL(소급 수집 불가).';
