-- ================================
-- Admin 경매 등록 문제 해결
-- ================================
-- 1. Admin 계정의 md_status 설정
-- 2. 테스트 클럽 추가
-- 3. RLS 정책 검증

-- 1. Admin 계정(김민기)의 md_status를 approved로 설정
UPDATE users
SET md_status = 'approved'
WHERE id = 'a65329d2-da8a-48ad-aa96-2bfd77ae275'
  AND role = 'admin';

-- 2. 테스트 클럽이 없다면 추가 (이미 있으면 무시)
INSERT INTO clubs (id, name, area, address, md_id, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '테스트 클럽',
  '강남',
  '서울시 강남구 테스트로 1',
  'a65329d2-da8a-48ad-aa96-2bfd77ae275',
  now(),
  now()
)
ON CONFLICT DO NOTHING;

-- 3. 클럽이 하나라도 있는지 확인하고, 없으면 강제로 기본 클럽 추가
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clubs LIMIT 1) THEN
    INSERT INTO clubs (id, name, area, address, md_id, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      'NightFlow 강남점',
      '강남',
      '서울시 강남구',
      'a65329d2-da8a-48ad-aa96-2bfd77ae275',
      now(),
      now()
    );
  END IF;
END $$;

-- 4. RLS 정책 검증을 위한 함수 (디버깅용)
CREATE OR REPLACE FUNCTION debug_auction_creation_check(p_user_id UUID)
RETURNS TABLE (
  check_name TEXT,
  result BOOLEAN,
  details TEXT
) AS $$
BEGIN
  -- Check 1: User exists
  RETURN QUERY
  SELECT
    'User exists'::TEXT,
    EXISTS(SELECT 1 FROM users WHERE id = p_user_id),
    (SELECT CONCAT('role: ', role, ', md_status: ', md_status) FROM users WHERE id = p_user_id);

  -- Check 2: Has admin or approved MD role
  RETURN QUERY
  SELECT
    'Has permission'::TEXT,
    EXISTS(
      SELECT 1 FROM users
      WHERE id = p_user_id
      AND (role = 'admin' OR (role = 'md' AND md_status = 'approved'))
    ),
    CASE
      WHEN (SELECT role FROM users WHERE id = p_user_id) = 'admin' THEN 'Admin role - OK'
      WHEN (SELECT role FROM users WHERE id = p_user_id) = 'md'
           AND (SELECT md_status FROM users WHERE id = p_user_id) = 'approved' THEN 'Approved MD - OK'
      ELSE 'No permission'
    END;

  -- Check 3: Has clubs
  RETURN QUERY
  SELECT
    'Has clubs available'::TEXT,
    EXISTS(SELECT 1 FROM clubs LIMIT 1),
    CONCAT((SELECT COUNT(*) FROM clubs), ' clubs found')::TEXT;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 사용 예시:
-- SELECT * FROM debug_auction_creation_check('a65329d2-da8a-48ad-aa96-2bfd77ae275');
