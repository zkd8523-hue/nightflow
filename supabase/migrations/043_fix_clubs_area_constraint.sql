-- Fix: clubs.area CHECK 제약조건 확장
-- 문제: 001_initial_schema에서 clubs.area가 ('강남','홍대','이태원')만 허용
-- Migration 039에서 users.area는 확장했으나 clubs.area는 누락
-- MD 신청 시 '건대', '부산' 등 선택하면 클럽 INSERT 실패

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'clubs'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%area%'
  ) LOOP
    EXECUTE format('ALTER TABLE clubs DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE clubs ADD CONSTRAINT clubs_area_check
  CHECK (area IS NULL OR area IN (
    '강남', '홍대', '이태원', '건대',
    '부산', '대구', '인천', '광주', '대전', '울산', '세종'
  ));
