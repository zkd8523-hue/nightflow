-- 686: 예약 취소 사유 수집 (2026-10-04)
--
-- 손님이 확인서(/booking/[token])에서 취소할 때 사유를 고르게 하고, 파트너(MD)가
-- 취소할 때 적는 사유도 지금까진 운영자 푸시로만 나가고 어디에도 남지 않았다.
-- 둘 다 같은 컬럼에 남겨 /admin/korean-bookings · /admin/foreign에서 보고 집계한다.
--
--   cancelled_by   : 'guest' | 'md' | 'admin'
--   cancel_reason  : 손님 선택지 코드(src/lib/bookingCancelReasons.ts). MD 취소는 'md'
--   cancel_note    : 손님 '기타' 직접 입력 · MD가 적은 사유
--   cancelled_at   : 취소 시각
--
-- 컬럼 추가만 — 기존 데이터·정책에 영향 없음.

ALTER TABLE korean_booking_requests
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT CHECK (cancelled_by IN ('guest', 'md', 'admin')),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancel_note TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE foreign_requests
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT CHECK (cancelled_by IN ('guest', 'md', 'admin')),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancel_note TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
