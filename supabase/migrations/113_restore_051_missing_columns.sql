-- ============================================================================
-- Migration 113: Migration 051 누락 컬럼 추가 복구
-- 날짜: 2026-04-16
-- 설명: Migration 094처럼 051에서 추가됐어야 하지만 리모트 DB에 미적용된
--       md_customer_grade, is_reviewer 컬럼 복구.
--       109(public_user_profiles VIEW)가 이 컬럼들을 참조하므로 선행 필요.
-- ============================================================================

-- 1. md_customer_grade_type ENUM (이미 있으면 skip)
DO $$ BEGIN
  CREATE TYPE md_customer_grade_type AS ENUM ('rookie', 'bronze', 'silver', 'gold', 'diamond');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. 누락 컬럼 복구
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_customer_grade md_customer_grade_type DEFAULT 'rookie';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_reviewer BOOLEAN DEFAULT false;

-- 3. 051이 추가했어야 하는 다른 컬럼들도 안전하게 보장 (이미 있으면 skip)
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_avg_rating NUMERIC(3,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_review_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
