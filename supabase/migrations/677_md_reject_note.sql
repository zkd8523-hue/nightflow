-- ============================================================================
-- Migration 677: 제안서 거절 사유 "직접 입력"
--
-- 거절 사유가 금액 부족 / 당일 미출근 / 예약 만료 세 개뿐이라, 그 밖의 사정
-- (단체 예약 불가, 드레스코드 등)은 파트너가 말할 방법이 없었다(2026-09-30).
-- 네 번째 사유 'other'를 허용하고, 파트너가 적은 문장은 md_reject_note에 둔다.
-- 승인하거나 MD가 바뀌면 NULL로 지운다(다른 md_* 응답 컬럼과 같은 수명).
--
-- md_reject_reason의 CHECK는 Migration 648/654에서 컬럼과 함께 이름 없이 만들어져
-- 자동 이름이 붙어 있다 — 이름을 추측해 DROP IF EXISTS 하면 이름이 다를 때 조용히
-- 안 지워지고 'other'가 계속 막힌다. 그래서 이 컬럼에 걸린 CHECK를 카탈로그에서
-- 찾아 지운 뒤 이름을 붙여 다시 만든다. 여러 번 실행해도 결과가 같다.
-- ============================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'c'
      AND c.conrelid IN ('foreign_requests'::regclass, 'korean_booking_requests'::regclass)
      AND a.attname = 'md_reject_reason'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE foreign_requests
  ADD CONSTRAINT foreign_requests_md_reject_reason_check
  CHECK (md_reject_reason IS NULL OR md_reject_reason IN ('budget', 'absent', 'expired', 'other'));

ALTER TABLE korean_booking_requests
  ADD CONSTRAINT korean_booking_requests_md_reject_reason_check
  CHECK (md_reject_reason IS NULL OR md_reject_reason IN ('budget', 'absent', 'expired', 'other'));

ALTER TABLE foreign_requests
  ADD COLUMN IF NOT EXISTS md_reject_note TEXT;

ALTER TABLE korean_booking_requests
  ADD COLUMN IF NOT EXISTS md_reject_note TEXT;

COMMENT ON COLUMN foreign_requests.md_reject_note IS
  '거절 사유 직접 입력(md_reject_reason=''other'')일 때 파트너가 적은 문장. Migration 677';
COMMENT ON COLUMN korean_booking_requests.md_reject_note IS
  '거절 사유 직접 입력(md_reject_reason=''other'')일 때 파트너가 적은 문장. Migration 677';
