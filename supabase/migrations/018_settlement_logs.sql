-- 018: 정산 이력 테이블
-- NightFlow → MD 수동 정산 추적용

CREATE TABLE settlement_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_sales INTEGER NOT NULL,        -- 해당 기간 총 매출
  commission_amt INTEGER NOT NULL,     -- 수수료 (10%)
  settlement_amt INTEGER NOT NULL,     -- 정산액 (매출 - 수수료)
  bank_name TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'transferred', 'failed')),
  transferred_at TIMESTAMPTZ,
  admin_id UUID REFERENCES users(id),  -- 처리한 admin
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_settlement_logs_md ON settlement_logs(md_id);
CREATE INDEX idx_settlement_logs_status ON settlement_logs(status);

ALTER TABLE settlement_logs ENABLE ROW LEVEL SECURITY;

-- Admin은 모든 정산 관리 가능
CREATE POLICY "Admin can manage settlements" ON settlement_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- MD는 본인 정산 내역만 조회 가능
CREATE POLICY "MD can view own settlements" ON settlement_logs
  FOR SELECT USING (auth.uid() = md_id);
