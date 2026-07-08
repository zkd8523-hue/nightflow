-- 426: clubs.area / users.area CHECK 제약에 '수원' 추가
-- 배경: 수원 클럽(피치라운지 등) 등록 시 area='수원'이 제약에 없어 INSERT 실패
-- 043(clubs) / 039(users)의 제약을 재생성하며 '수원' 포함

-- clubs.area
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
    '강남', '홍대', '이태원', '건대', '수원',
    '부산', '대구', '인천', '광주', '대전', '울산', '세종'
  ));

-- users.area (일관성)
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
    '강남', '홍대', '이태원', '건대', '수원',
    '부산', '대구', '인천', '광주', '대전', '울산', '세종'
  ));
