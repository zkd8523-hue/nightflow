-- ============================================================================
-- Migration 635: 확정서 MD용 링크 토큰
--
-- 배경: 확정서를 손님용/공급자용 두 장으로 설계했는데 손님용 링크만 만들었다.
--      MD는 같은 예약을 다른 내용으로 봐야 한다 — 손님 연락처는 가리고,
--      수령액·준비 내역·입장 완료 버튼을 보여준다.
--
-- 토큰을 분리하는 이유: 손님용 링크가 MD에게 전달되거나 그 반대가 되어도
--      각자 자기 화면만 보게 된다. 한 토큰에 역할 쿼리를 붙이면(?role=md)
--      손님이 URL을 고쳐서 내부 정보를 볼 수 있다.
-- ============================================================================

ALTER TABLE booking_confirmations
  ADD COLUMN IF NOT EXISTS md_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex');

-- 기존 행 채우기 (DEFAULT는 신규 행에만 적용된다)
UPDATE booking_confirmations
   SET md_token = encode(gen_random_bytes(16), 'hex')
 WHERE md_token IS NULL;

ALTER TABLE booking_confirmations ALTER COLUMN md_token SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booking_conf_md_token ON booking_confirmations(md_token);

COMMENT ON COLUMN booking_confirmations.md_token IS
  'MD용 확정서 링크 토큰. /booking/md/[token]. 손님용(public_token)과 분리해 서로의 화면을 못 보게 한다.';
