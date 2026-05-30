-- Migration 277: 한 줄 리뷰 안정화 패치
--
-- 증상: 일반 유저가 club_one_liners INSERT 시 "처리 중 오류" 발생
-- 원인 후보:
--   1) users RLS(109)가 본인 외 행을 차단 → NOT EXISTS 서브쿼리가 의도와 다르게 동작 가능
--   2) RLS 정책에서 club_partners 직접 참조 → club_partners RLS 차단 가능성
--   3) INSERT 후 RETURNING 시 SELECT 정책 통과 여부 불확실
--
-- 해결: SECURITY DEFINER 헬퍼 함수로 권한 체크를 통일하여
-- RLS 재귀/차단 이슈를 원천 차단.

-- ============================================
-- 1) 헬퍼 함수: 차단/삭제 유저 여부 (SECURITY DEFINER)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_blocked_or_deleted(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
      AND (is_blocked = TRUE OR deleted_at IS NOT NULL)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_or_deleted(UUID) TO authenticated;

-- ============================================
-- 2) 헬퍼 함수: 해당 클럽 파트너 MD 여부 (SECURITY DEFINER)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_club_partner(p_club_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_partners
    WHERE club_id = p_club_id
      AND md_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_club_partner(UUID, UUID) TO authenticated;

-- ============================================
-- 3) club_one_liners RLS 정책 재작성 (헬퍼 함수 사용)
-- ============================================
DROP POLICY IF EXISTS "Login users can write one-liner" ON club_one_liners;
DROP POLICY IF EXISTS "Login non-partner users can write one-liner" ON club_one_liners;

CREATE POLICY "Login non-partner users can write one-liner"
  ON club_one_liners
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = author_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND NOT public.is_club_partner(club_id, auth.uid())
  );

-- SELECT/UPDATE/DELETE 정책은 275에서 정의된 것 유지
-- (Anyone can read one-liners / Author can update own / Author or admin can delete)

-- ============================================
-- 4) one_liner_likes RLS 정책 재작성 (헬퍼 함수 사용)
-- ============================================
DROP POLICY IF EXISTS "Like others only" ON one_liner_likes;

CREATE POLICY "Like others only"
  ON one_liner_likes
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM club_one_liners
      WHERE id = one_liner_id AND author_id = auth.uid()
    )
  );

-- ============================================
-- 5) one_liner_reports RLS 정책 재작성 (헬퍼 함수 사용)
-- ============================================
DROP POLICY IF EXISTS "Login users can report one-liner" ON one_liner_reports;

CREATE POLICY "Login users can report one-liner"
  ON one_liner_reports
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND reporter_id = auth.uid()
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM club_one_liners
      WHERE id = one_liner_id
        AND author_id = auth.uid()
    )
  );

COMMENT ON FUNCTION public.is_blocked_or_deleted(UUID) IS
  '차단/탈퇴 유저 여부. RLS WITH CHECK에서 users 재참조 시 권한 이슈 회피';
COMMENT ON FUNCTION public.is_club_partner(UUID, UUID) IS
  '특정 클럽의 파트너 MD 여부. RLS WITH CHECK에서 club_partners 직접 참조 회피';
