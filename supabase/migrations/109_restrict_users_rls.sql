-- ============================================
-- Migration 109: users RLS 재설계 + public_user_profiles VIEW
-- ============================================
-- 배경: 기존 "Public user profiles" 정책(FOR SELECT USING (true))이
-- 익명 유저에게까지 name/phone/kakao_id 등 모든 실명 컬럼을 노출.
-- 공개 컬럼만 담은 VIEW를 새로 만들고, users 직접 SELECT는
-- 본인/MD(본인 경매 입찰자)/Admin에게만 허용한다.

-- 1) 공개용 VIEW
-- MD 연락처 컬럼은 role='md'인 행에서만 노출(CASE WHEN)
CREATE OR REPLACE VIEW public_user_profiles AS
SELECT
  id,
  display_name,
  profile_image,
  role,
  md_unique_slug,
  md_customer_grade,
  is_reviewer,
  CASE WHEN role = 'md' THEN instagram END AS instagram,
  CASE WHEN role = 'md' THEN kakao_open_chat_url END AS kakao_open_chat_url,
  CASE WHEN role = 'md' THEN preferred_contact_methods END AS preferred_contact_methods,
  CASE WHEN role = 'md' THEN phone END AS phone
FROM users
WHERE deleted_at IS NULL;

GRANT SELECT ON public_user_profiles TO anon, authenticated;

COMMENT ON VIEW public_user_profiles IS
  '익명/일반 유저 대상 공개 프로필. 실명(name), 전화번호(일반 유저), 생일 등 민감 정보 제외.';

-- 2) Role 체크 헬퍼 함수
-- users RLS 정책 내부에서 users를 다시 질의하면 무한 재귀가 발생하므로
-- SECURITY DEFINER 함수로 RLS를 우회한다.
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

-- 3) 기존 전체 공개 정책 제거
DROP POLICY IF EXISTS "Public user profiles" ON users;

-- 4) MD 예외: 본인 경매에 입찰한/낙찰받은 유저 실명 조회 가능
-- auctions, bids 테이블만 참조하므로 users 재귀 없음
CREATE POLICY "MD can read own auction bidders" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auctions a
      WHERE a.md_id = auth.uid()
        AND (
          a.winner_id = users.id
          OR EXISTS (SELECT 1 FROM bids b WHERE b.auction_id = a.id AND b.bidder_id = users.id)
        )
    )
  );

-- 5) Admin 예외: 모든 유저 조회 가능 (SECURITY DEFINER 함수로 재귀 방지)
CREATE POLICY "Admin can read all users" ON users
  FOR SELECT USING (public.is_admin());

-- 기존 "Users can read own profile" (auth.uid() = id) 정책은 그대로 유지.
