-- ============================================================================
-- Migration 685: MD 정산 — 월별 수수료율 + 정산 완료 체크
-- 날짜: 2026-10-04
--
-- 682(정산 항목·발송 기록) 적용 뒤 운영자 요청으로 추가:
--   · 2026-09는 수수료 4%였다 → 달별 수수료율 표(행이 없는 달은 코드 기본값 5%)
--   · 정산 완료(입금 확인)를 운영자가 직접 체크 → 월·MD 한 쌍당 한 행(해제 = 삭제)
-- 코드보다 먼저 적용. 미적용이어도(685) /admin/settlements는 5%·미완료로 열리지만 체크·저장이 실패한다.
-- ============================================================================

-- 월별 수수료율 — 행이 없는 달은 5%(코드 기본값). 2026-09는 4%였다(운영자, 2026-10-04).
CREATE TABLE IF NOT EXISTS settlement_month_rates (
  month      TEXT PRIMARY KEY CHECK (month ~ '^\d{4}-\d{2}$'),
  rate       NUMERIC(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 정산 완료 체크 — 월·MD 한 쌍당 한 행(체크 해제 = 행 삭제).
CREATE TABLE IF NOT EXISTS settlement_payments (
  month    TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  md_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paid_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by  UUID REFERENCES users(id),
  PRIMARY KEY (month, md_id)
);
ALTER TABLE settlement_month_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin manages settlement rates" ON settlement_month_rates;
CREATE POLICY "admin manages settlement rates" ON settlement_month_rates
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "admin manages settlement payments" ON settlement_payments;
CREATE POLICY "admin manages settlement payments" ON settlement_payments
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
INSERT INTO settlement_month_rates (month, rate) VALUES ('2026-09', 0.04)
ON CONFLICT (month) DO NOTHING;

