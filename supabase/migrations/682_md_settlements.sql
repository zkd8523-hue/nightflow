-- ============================================================================
-- Migration 682: MD 정산(수수료) — 정산 항목 + MD 안내 발송 기록
-- 날짜: 2026-10-04
--
-- 배경:
--   확정된 예약은 MD가 손님에게 직접 받고(Model B), 나이트플로우는 확정 금액의 5%를
--   수수료로 월 단위 정산한다(방문일 기준 월, 익월 10일 전 지급). 운영자가 엑셀 대신
--   /admin/settlements에서 MD별 금액을 확인하고 MD에게 바로 안내를 보낸다.
--
-- settlement_items: 확정서(booking_confirmations) 1건당 0~1행. 행이 없으면 기본값을 쓴다 —
--   외국인 확정은 포함, 한국 확정은 제외(운영자 결정 2026-10-04 "국내는 일단 빼").
--   amount가 NULL이면 확정서 total_price. 실제 받은 금액이 다르면(추가 주문 등) 여기서 고친다
--   — 손님이 보는 확정서 금액은 건드리지 않는다.
-- settlement_notices: "MD에게 보내기" 이력. 같은 달·같은 MD에 여러 번 보낼 수 있다(정정 재발송).
--
-- 코드 배포 전에 적용해야 한다 — /admin/settlements가 두 테이블을 읽는다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS settlement_items (
  confirmation_id UUID PRIMARY KEY REFERENCES booking_confirmations(id) ON DELETE CASCADE,
  included        BOOLEAN NOT NULL,
  amount          INTEGER CHECK (amount IS NULL OR amount >= 0),
  note            TEXT,
  updated_by      UUID REFERENCES users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlement_notices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month         TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  md_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_count    INTEGER NOT NULL,
  total_amount  INTEGER NOT NULL,
  fee_amount    INTEGER NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('push', 'sms')),
  message       TEXT NOT NULL,
  sent_by       UUID REFERENCES users(id),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_settlement_notices_month_md ON settlement_notices (month, md_id, sent_at DESC);

ALTER TABLE settlement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manages settlement items" ON settlement_items;
CREATE POLICY "admin manages settlement items" ON settlement_items
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin manages settlement notices" ON settlement_notices;
CREATE POLICY "admin manages settlement notices" ON settlement_notices
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- 운영자가 말한 첫 정산분(2026-10-04): 9월 CL-1675 620만(확정서 금액 비어 있음),
-- 10월 CA-6508 170만(확정서 140만), 10월 CA-6382 35만(한국 예약이지만 포함).
INSERT INTO settlement_items (confirmation_id, included, amount, note)
SELECT id, TRUE, v.amount, v.note
FROM booking_confirmations bc
JOIN (VALUES
  ('CL-1675', 6200000, '운영자 제공 금액(확정서 금액 비어 있음)'),
  ('CA-6508', 1700000, '운영자 제공 금액(확정서 140만)'),
  ('CA-6382', NULL::INTEGER, '한국 예약이지만 정산 포함(운영자 결정)')
) AS v(ref_no, amount, note) ON v.ref_no = bc.ref_no
ON CONFLICT (confirmation_id) DO NOTHING;
