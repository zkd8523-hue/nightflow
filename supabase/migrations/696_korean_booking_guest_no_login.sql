-- ============================================================================
-- Migration 696: 한국어 예약 요청을 로그인 없이 받는다 (외국인 폼과 같은 방식)
-- 날짜: 2026-10-22
--
-- 배경(9/28~10/22 실측):
--   한국어 예약은 "예약하기"를 누르면 로그인부터 요구했다. 로그인한 뒤 폼을 연 76명 중
--   53명이 그 기간에 막 가입한 사람이었고, 실제 요청은 4건뿐이었다. 로그인 화면에서 몇 명이
--   빠지는지는 기록조차 없었다. 외국인 폼은 로그인 없이 연락처만 받는다.
--
-- 바뀌는 것:
--   - user_id를 비울 수 있다(NULL = 비회원 요청). 로그인한 손님은 지금처럼 본인 id가 들어간다.
--   - 비회원도 INSERT할 수 있다. 단 user_id를 남의 id로 넣는 건 막는다(NULL이거나 본인만).
--   - 비회원 요청은 본인이 SELECT할 수 없다(조회는 지금처럼 본인 행만) — 폼은 insert 결과를
--     다시 읽지 않으므로 문제 없다. 손님은 확정 문자·제안 링크(토큰)로 본다.
--
-- 그대로인 것:
--   - 인앱 알림 트리거(679)는 user_id가 NULL이면 INSERT가 실패하지만 EXCEPTION으로 삼켜
--     예약 저장은 막지 않는다. 확정 알림(notifyMd.ts)은 비회원이면 푸시를 건너뛰고 문자로 보낸다.
--   - 수정·취소 정책(653)은 auth.uid() = user_id일 때만 걸려서 비회원 행엔 영향이 없다.
--
-- 코드보다 먼저 적용해야 한다 — 코드가 비회원 INSERT를 보내면 이 정책 없이는 거부된다.
-- ============================================================================

ALTER TABLE korean_booking_requests ALTER COLUMN user_id DROP NOT NULL;

DROP POLICY IF EXISTS "user inserts own korean booking request" ON korean_booking_requests;
CREATE POLICY "user inserts own korean booking request" ON korean_booking_requests
  FOR INSERT WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

COMMENT ON COLUMN korean_booking_requests.user_id IS
  '요청한 회원. NULL이면 로그인 없이 연락처로만 요청한 비회원 (Migration 696)';
