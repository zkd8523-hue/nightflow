-- ============================================================================
-- Migration 639: 도착 알림 재발송 허용 (5분 쿨다운)
--
-- 배경: UNIQUE(request_id, kind)로 같은 종류("10분 전"/"도착")는 1회만
--      발송되게 막아뒀는데, 재확인 차 다시 눌러야 하는 경우가 있다.
--      완전 무제한이면 손님이 연타해 MD 폰에 문자 폭탄이 될 수 있어
--      API 레벨에서 5분 쿨다운을 둔다(이 마이그레이션은 그 전제조건인
--      UNIQUE 제약만 제거 — 쿨다운 자체는 arrival_pings.created_at을
--      조회해 애플리케이션에서 판단한다).
--
-- 참조: 632_arrival_pings.sql
-- ============================================================================

ALTER TABLE arrival_pings
  DROP CONSTRAINT IF EXISTS arrival_pings_request_id_kind_key;

COMMENT ON TABLE arrival_pings IS
  '손님이 확인표에서 누른 도착 신호. 같은 종류(kind)를 5분 쿨다운 후 재발송 가능(API가 판단).';
