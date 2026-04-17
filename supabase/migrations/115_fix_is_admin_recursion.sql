-- ============================================================================
-- Migration 114: is_admin() 무한 재귀 수정
-- 날짜: 2026-04-17
-- 설명: is_admin() 함수가 users 테이블을 SELECT할 때 RLS가 다시 적용되어
--       "infinite recursion detected in policy for relation users" 발생.
--       SET row_security = off 추가로 함수 내부 RLS 우회.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
