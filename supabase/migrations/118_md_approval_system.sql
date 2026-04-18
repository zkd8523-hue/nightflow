-- ============================================
-- MD 승인제 + 인스타 인증코드 시스템
-- 자동승인 → Admin 수동승인 전환
-- ============================================

-- 1. 인스타그램 인증 관련 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_verify_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_verified_at TIMESTAMPTZ;

-- 2. 기존 approved MD는 인스타 인증 완료로 처리
UPDATE users
SET instagram_verified_at = now()
WHERE md_status = 'approved'
  AND instagram IS NOT NULL
  AND instagram_verified_at IS NULL;
