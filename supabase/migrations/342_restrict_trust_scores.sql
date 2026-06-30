-- ============================================================================
-- Migration 342: user_trust_scores 접근 제어 (MD/admin 전용 RPC 경유)
-- 날짜: 2026-06-30
-- 설명:
--   user_trust_scores 는 VIEW 라 RLS 를 직접 걸 수 없어, 그동안 Supabase
--   기본 권한으로 anon/authenticated 가 전체 유저의 신뢰도(노쇼/차단/거래액 등)를
--   조회할 수 있는 상태였다. 직접 SELECT 를 회수하고, 호출자가 MD/admin 인지
--   확인하는 SECURITY DEFINER RPC 두 개(목록/단건)만 노출한다.
--
--   ⚠️ 배포 순서: 이 마이그레이션 적용과 프론트엔드(get_trust_scores/
--   get_trust_score RPC 사용) 배포를 함께 진행해야 한다. 적용만 하고
--   구버전 프론트가 남아 있으면 VIP 화면의 신뢰도 목록이 비어 보인다.
-- ============================================================================

-- 1) 뷰 직접 SELECT 회수 (logged-out + 일반 유저 차단)
REVOKE SELECT ON user_trust_scores FROM anon, authenticated;

-- 2) 목록 조회 (MD/admin 전용)
CREATE OR REPLACE FUNCTION get_trust_scores(p_limit INT DEFAULT 50)
RETURNS SETOF user_trust_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('md', 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden: MD/admin only';
  END IF;

  RETURN QUERY
  SELECT * FROM user_trust_scores
  LIMIT GREATEST(COALESCE(p_limit, 50), 0);
END;
$$;

-- 3) 단건 조회 (MD/admin 전용) — 입찰자 프로필 모달용
CREATE OR REPLACE FUNCTION get_trust_score(p_user_id UUID)
RETURNS SETOF user_trust_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('md', 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden: MD/admin only';
  END IF;

  RETURN QUERY
  SELECT * FROM user_trust_scores WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_trust_scores(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_trust_score(UUID) TO authenticated;

COMMENT ON FUNCTION get_trust_scores(INT) IS
  'Migration 342: user_trust_scores 목록을 MD/admin 에게만 노출하는 게이트 RPC.';
COMMENT ON FUNCTION get_trust_score(UUID) IS
  'Migration 342: user_trust_scores 단건을 MD/admin 에게만 노출하는 게이트 RPC.';
