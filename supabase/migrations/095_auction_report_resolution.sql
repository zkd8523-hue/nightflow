-- ============================================================================
-- Migration 095: 경매 신고 Admin 판정 시스템
--
-- 문제:
--   auction_reports에 상태 관리가 없어 Admin이 신고를 승인/기각할 수 없음.
--   MD 입장에서 일방적 신고 구조.
--
-- 수정:
--   1) status 컬럼 추가 (pending → approved / dismissed)
--   2) resolved_at, resolved_by 컬럼 추가
--   3) Admin UPDATE 정책 추가
-- ============================================================================

-- 1. 상태 관리 컬럼 추가
ALTER TABLE auction_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);

-- status CHECK 제약 (NOT VALID로 기존 데이터 보존)
ALTER TABLE auction_reports
  ADD CONSTRAINT check_report_status
  CHECK (status IN ('pending', 'approved', 'dismissed'))
  NOT VALID;

-- 2. Admin UPDATE 정책 추가
CREATE POLICY "Admins can update reports" ON auction_reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
