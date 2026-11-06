-- ============================================================================
-- Migration 708: 담당자별 중개료 요율 (2026-11-06)
--
-- 지금까지 요율은 달 단위뿐이었다(settlement_month_rates, 없으면 기본 5%). 강한별 담당자는 10%로 약속해서
-- 담당자별 요율을 따로 둔다. 적용 순서: 담당자 요율 > 달별 요율 > 기본 5%.
-- 정산 화면·정산 안내 문자·담당자 정산 화면·자동 리마인드가 같은 값을 쓴다.
--
-- 코드보다 먼저 적용한다. 미적용이어도 화면은 열리지만 전부 기존 요율로 계산된다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS settlement_md_rates (
  md_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rate       NUMERIC(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  note       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE settlement_md_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin manages settlement md rates" ON settlement_md_rates;
CREATE POLICY "admin manages settlement md rates" ON settlement_md_rates
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- 강한별(DM SEOUL 대표 담당자) 10% — 운영자 확인 2026-11-06
INSERT INTO settlement_md_rates (md_id, rate, note)
VALUES ('f487373d-a7b5-407f-aba2-7a39a1ba6751', 0.10, '운영자와 10% 약속 (2026-11-06)')
ON CONFLICT (md_id) DO UPDATE SET rate = EXCLUDED.rate, note = EXCLUDED.note, updated_at = now();
