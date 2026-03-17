-- ================================
-- 긴급 수정: 경매 등록 오류 해결
-- ================================
-- Supabase SQL Editor에서 이 전체 내용을 복사해서 실행하세요!
-- https://supabase.com/dashboard/project/ihqztsakxczzsxfvdkpq/sql/new

-- 1. Admin 계정(김민기)의 md_status 설정
UPDATE users
SET md_status = 'approved'
WHERE id = 'a65329d2-da8a-48ad-aa96-2bfd77ae275'::uuid;

-- 2. 기존 클럽의 md_id 업데이트 (Admin 소유로 변경)
UPDATE clubs
SET md_id = 'a65329d2-da8a-48ad-aa96-2bfd77ae275'::uuid
WHERE md_id IS NULL;

-- 3. 클럽이 하나도 없다면 테스트 클럽 추가
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clubs LIMIT 1) THEN
    INSERT INTO clubs (id, name, area, address, md_id, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      'NightFlow 강남점',
      '강남',
      '서울시 강남구 테스트로 1',
      'a65329d2-da8a-48ad-aa96-2bfd77ae275'::uuid,
      now(),
      now()
    );
    RAISE NOTICE 'OK 테스트 클럽이 생성되었습니다.';
  ELSE
    RAISE NOTICE 'OK 클럽이 이미 존재합니다.';
  END IF;
END $$;

-- 4. 검증: Admin 계정 확인
SELECT
  'Admin 계정' AS check_type,
  name,
  role,
  md_status
FROM users
WHERE id = 'a65329d2-da8a-48ad-aa96-2bfd77ae275'::uuid;

-- 5. 검증: 클럽 목록 확인
SELECT
  'Club 목록' AS check_type,
  name,
  area,
  CASE
    WHEN md_id IS NOT NULL THEN 'OK'
    ELSE 'NO md_id'
  END AS status
FROM clubs
ORDER BY created_at DESC
LIMIT 3;

-- 6. 검증: 경매 생성 권한 확인
SELECT
  '권한 확인' AS check_type,
  CASE
    WHEN EXISTS(
      SELECT 1 FROM users
      WHERE id = 'a65329d2-da8a-48ad-aa96-2bfd77ae275'::uuid
      AND (role = 'admin' OR (role = 'md' AND md_status = 'approved'))
    ) THEN 'OK - 경매 등록 가능'
    ELSE 'ERROR - 권한 없음'
  END AS result;

-- ================================
-- 실행 후 예상 결과:
-- - Admin 계정: md_status = 'approved'
-- - 클럽 1개 이상 존재
-- - can_create_auction = true
-- ================================
