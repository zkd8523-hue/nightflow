-- =============================================
-- Migration 045: MD 제재 및 자격 박탈 시스템
-- =============================================

-- 1. md_status CHECK 확장 (suspended, revoked 추가)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_md_status_check;
ALTER TABLE users ADD CONSTRAINT users_md_status_check
  CHECK (md_status IN ('pending', 'approved', 'rejected', 'suspended', 'revoked'));

-- 2. 정지 만료일 컬럼
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_suspended_until TIMESTAMPTZ;

-- 3. 제재 이력 테이블
CREATE TABLE IF NOT EXISTS md_sanctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('warning', 'suspend', 'unsuspend', 'revoke')),
  reason TEXT NOT NULL,
  duration_days INTEGER,
  suspended_until TIMESTAMPTZ,
  active_auctions_cancelled INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sanctions_md ON md_sanctions(md_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_created ON md_sanctions(created_at DESC);

ALTER TABLE md_sanctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sanctions" ON md_sanctions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
