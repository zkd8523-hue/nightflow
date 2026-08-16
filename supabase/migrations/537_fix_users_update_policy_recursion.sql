-- ============================================================================
-- Migration 537: users UPDATE 정책 무한 재귀 수정
-- 날짜: 2026-08-16
--
-- 증상:
--   프로필 편집에서 저장 시 실패.
--   "infinite recursion detected in policy for relation \"users\""
--
-- 원인:
--   Migration 037 의 "Admins can update users" 정책이
--     USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
--   처럼 users 정책 안에서 users 를 다시 조회한다.
--
--   Migration 533 이 "Public user profiles" (USING true) 를 제거하기 전까지는
--   그 무조건 통과 정책 덕에 내부 서브쿼리가 재귀 없이 풀렸다. 533 적용 후
--   서브쿼리가 다시 users 정책을 평가하게 되면서 재귀가 표면화됐다.
--
--   109/533 은 SELECT 정책들만 is_admin() (SECURITY DEFINER) 으로 옮겼고,
--   UPDATE 정책인 037 은 손대지 않아 남아 있었다.
--
-- 조치:
--   admin 판별을 public.is_admin() 으로 교체. SECURITY DEFINER 라 정책 평가를
--   우회하므로 재귀가 발생하지 않는다.
--   WITH CHECK 도 함께 지정한다 — 037 은 USING 만 있어서 admin 의 UPDATE 가
--   갱신 후 행 검사에서 걸릴 수 있었다(034 가 본인 프로필에 대해 고친 것과 동일 이슈).
-- ============================================================================

-- is_admin() 은 533 에서 생성되지만, 533 미적용 환경 대비로 재생성 (멱등)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- 재귀를 유발하던 037 정책 교체
DROP POLICY IF EXISTS "Admins can update users" ON users;

CREATE POLICY "Admins can update users" ON users
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON POLICY "Admins can update users" ON users IS
  'Admin 의 타 유저 레코드 수정 허용. users 재귀를 피하려 반드시 is_admin() (SECURITY DEFINER) 사용.';

-- ── 적용 후 확인 ─────────────────────────────────────────────────────────────
-- 1) 일반 유저 로그인 상태에서 프로필 편집 → 저장 성공해야 한다.
--    (본인 행은 034 의 "Users can update own profile" 정책으로 통과)
-- 2) Admin 로그인 상태에서 /admin/mds MD 승인/반려 동작해야 한다.
-- 3) users 에 남은 정책 중 서브쿼리로 users 를 직접 읽는 것이 없어야 한다:
--      SELECT policyname, cmd, qual, with_check FROM pg_policies
--       WHERE tablename = 'users';
