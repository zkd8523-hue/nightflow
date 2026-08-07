-- ============================================================================
-- Migration 533: users 테이블 익명 조회 차단 (Migration 109 재적용)
-- 날짜: 2026-08-07
--
-- ⚠️ 적용 시점 주의
--   반드시 "Migration 532 적용 → 코드 배포(users 직접 조회 → public_user_profiles
--   교체) 완료 → 배포 확인" 이후에 적용할 것. 순서를 어기면 공개 프로필(/u/[id]),
--   MD 페이지(/md/[slug]) 등이 즉시 404가 된다.
--
-- 문제:
--   001의 "Public user profiles" 정책(USING (true))이 살아 있어 익명 키로
--   users 를 직접 SELECT 할 수 있다. 실제 익명 요청으로 phone/kakao_id 값이
--   반환되는 것을 확인했다. anon 키는 브라우저 번들에 포함되므로 누구나 가능하다.
--   Migration 109가 같은 문제를 고치려 했으나 프로덕션에 반영되지 않은 상태.
--
-- 조치: 전체 공개 정책 제거. 이후 users 직접 SELECT 는
--       본인 / MD(본인 경매 입찰자) / admin 만 가능하고,
--       공개 정보는 public_user_profiles 뷰로만 나간다.
-- ============================================================================

-- 1) admin 판별 헬퍼 (109에서 도입, 미적용 대비 재생성)
--    users RLS 정책 안에서 users 를 다시 질의하면 무한 재귀 → SECURITY DEFINER 로 우회
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

-- 2) 본인 프로필 조회 (없으면 생성)
DROP POLICY IF EXISTS "Users can read own profile" ON users;
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- 3) MD 예외: 본인 경매 입찰자/낙찰자 실명 조회
DROP POLICY IF EXISTS "MD can read own auction bidders" ON users;
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

-- 4) Admin 예외
DROP POLICY IF EXISTS "Admin can read all users" ON users;
CREATE POLICY "Admin can read all users" ON users
  FOR SELECT USING (public.is_admin());

-- 5) 전체 공개 정책 제거 — 실제 차단이 일어나는 지점
DROP POLICY IF EXISTS "Public user profiles" ON users;

-- ── 적용 후 확인 ─────────────────────────────────────────────────────────────
-- 익명 키로 아래가 빈 배열이어야 한다 (값이 나오면 다른 공개 정책이 남아 있는 것):
--   curl "$URL/rest/v1/users?select=id,phone&limit=1" -H "apikey: $ANON_KEY"
-- 그리고 아래는 정상 응답이어야 한다:
--   curl "$URL/rest/v1/public_user_profiles?select=id,display_name&limit=1" -H "apikey: $ANON_KEY"
-- 화면 확인: /u/[userId], /md/[slug], 깃발 상세 방장 배지, 채팅 프로필 미리보기
