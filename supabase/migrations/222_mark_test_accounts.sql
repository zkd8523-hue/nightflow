-- 테스트 계정 일괄 마킹 (소셜프루프/velocity 통계에서 제외)
-- public.users에는 email 없음 → auth.users.email로 JOIN
-- 기준:
--   1. auth.users.email *@nightflow.test (test-bootstrap 부트스트랩)
--   2. phone 01099990001~3 (E2E 고정)
--   3. name에 test/테스트 포함
--   4. auth.users.email *@example.com

UPDATE public.users u
SET is_test = true
FROM auth.users au
WHERE au.id = u.id
  AND u.is_test = false
  AND (
    au.email LIKE '%@nightflow.test'
    OR au.email LIKE '%@example.com'
    OR au.email LIKE '%@test.com'
    OR au.email LIKE 'e2e_%'
    OR au.email ~ '^[0-9]+@[0-9]+\.[0-9]+$'  -- 2@22.2 같은 더미 패턴
  );

UPDATE public.users
SET is_test = true
WHERE is_test = false
  AND (
    REPLACE(COALESCE(phone, ''), '-', '') IN (
      '01099990001', '01099990002', '01099990003',
      '01000010001', '01000020001', '01000020002', '01000020003'
    )
    OR LOWER(name) LIKE '%test%'
    OR LOWER(name) LIKE '%테스트%'
  );

-- 깃발의 "MD에게 한마디"(puzzles.notes)에 "테스트"/"test" 넣은 leader 마킹
UPDATE public.users u
SET is_test = true
WHERE u.is_test = false
  AND u.id IN (
    SELECT DISTINCT p.leader_id
    FROM puzzles p
    WHERE p.notes ILIKE '%테스트%'
       OR p.notes ILIKE '%test%'
  );

-- 오퍼 한마디(puzzle_offers.comment)에 "테스트"/"test" 넣어 보낸 MD도 마킹
UPDATE public.users u
SET is_test = true
WHERE u.is_test = false
  AND u.id IN (
    SELECT DISTINCT po.md_id
    FROM puzzle_offers po
    WHERE po.comment ILIKE '%테스트%'
       OR po.comment ILIKE '%test%'
  );

-- 추가 휴리스틱: 같은 leader가 같은 event_date에 cancelled 중복 등록
UPDATE public.users u
SET is_test = true
WHERE u.is_test = false
  AND u.id IN (
    SELECT p.leader_id
    FROM puzzles p
    WHERE p.created_at >= now() - interval '30 days'
      AND p.status = 'cancelled'
    GROUP BY p.leader_id
    HAVING COUNT(*) >= 2
       AND COUNT(DISTINCT p.event_date) < COUNT(*)
  );
