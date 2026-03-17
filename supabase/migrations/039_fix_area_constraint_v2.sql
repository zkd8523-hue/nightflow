-- Fix: users.area CHECK 제약조건 - 로버스트 버전
-- 문제: 011 마이그레이션의 인라인 CHECK가 ('강남','홍대','이태원')만 허용
-- 해결: 기존 area CHECK를 모두 찾아 삭제 후 전체 지역으로 재생성
-- 037_fix_user_area_constraint.sql의 DROP이 자동생성 제약조건명과 불일치할 수 있어 pg_constraint 카탈로그 직접 조회

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%area%'
  ) LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE users ADD CONSTRAINT users_area_check
  CHECK (area IS NULL OR area IN (
    '강남', '홍대', '이태원', '건대',
    '부산', '대구', '인천', '광주', '대전', '울산', '세종'
  ));
