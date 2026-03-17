-- ============================================
-- users 테이블에 area 컬럼 추가
-- MD 가입 시 활동 지역 저장용
-- ============================================

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN area TEXT CHECK (area IN ('강남', '홍대', '이태원'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
