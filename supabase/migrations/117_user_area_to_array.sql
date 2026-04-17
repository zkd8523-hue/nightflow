-- ============================================
-- users.area: TEXT → TEXT[] (복수 활동 지역)
-- MD가 여러 지역에서 활동하는 경우 지원
-- ============================================

-- 1. 기존 CHECK 제약조건 모두 제거
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%area%'
  LOOP
    EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- 2. 기존 단일값을 배열로 변환
ALTER TABLE users
  ALTER COLUMN area TYPE TEXT[]
  USING CASE WHEN area IS NOT NULL THEN ARRAY[area] ELSE NULL END;
