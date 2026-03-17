-- 022: 계좌 실명 확인 시스템
-- 목적: MD 계좌 검증으로 타인 계좌 정산 사기 방지

-- users 테이블에 계좌 검증 상태 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_verified BOOLEAN DEFAULT false;

-- 계좌 검증 요청 테이블
CREATE TABLE bank_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  account_holder TEXT NOT NULL,  -- MD가 입력한 예금주명 (본인 이름)
  verified_by UUID REFERENCES users(id),  -- 검증한 admin
  verified_at TIMESTAMPTZ,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_bank_verif_md ON bank_verifications(md_id);
CREATE INDEX idx_bank_verif_status ON bank_verifications(verification_status) WHERE verification_status = 'pending';

-- RLS 정책
ALTER TABLE bank_verifications ENABLE ROW LEVEL SECURITY;

-- MD는 본인 검증 요청만 조회 가능
CREATE POLICY "MD can view own verifications" ON bank_verifications
  FOR SELECT USING (auth.uid() = md_id);

-- MD는 본인 검증 요청만 생성 가능
CREATE POLICY "MD can create own verifications" ON bank_verifications
  FOR INSERT WITH CHECK (auth.uid() = md_id);

-- Admin은 모든 검증 요청 관리 가능
CREATE POLICY "Admin can manage verifications" ON bank_verifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER bank_verifications_updated_at
  BEFORE UPDATE ON bank_verifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE bank_verifications IS 'MD 계좌 검증 요청 및 승인 이력';
COMMENT ON COLUMN bank_verifications.account_holder IS '예금주명 (MD 본인 이름과 일치해야 함)';
COMMENT ON COLUMN bank_verifications.verification_status IS 'pending: 검증 대기, verified: 승인, rejected: 거부';
