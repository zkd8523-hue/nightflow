-- ============================================================================
-- Migration 196: admin 전용 — 유저의 마지막 로그인/접속 시각 조회 RPC
-- 배경: 깃발 상세(관리자 전용) 작성자 정보 패널에 "마지막 접속" 표시 필요.
--       auth.users.last_sign_in_at은 Supabase가 로그인 + 토큰 refresh 시 갱신하므로
--       실용적으로 "마지막 접속"에 근접한 지표.
-- 보안: admin만 호출 허용 (SECURITY DEFINER + role 체크).
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_get_user_last_sign_in_at(p_user_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_last     TIMESTAMPTZ;
BEGIN
  SELECT (role = 'admin') INTO v_is_admin
  FROM users
  WHERE id = auth.uid();

  IF NOT COALESCE(v_is_admin, FALSE) THEN
    RAISE EXCEPTION '관리자만 조회할 수 있습니다';
  END IF;

  SELECT last_sign_in_at INTO v_last
  FROM auth.users
  WHERE id = p_user_id;

  RETURN v_last;
END;
$$;

REVOKE ALL ON FUNCTION admin_get_user_last_sign_in_at(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_user_last_sign_in_at(UUID) TO authenticated;

COMMENT ON FUNCTION admin_get_user_last_sign_in_at(UUID) IS
  'Migration 196: admin 전용. auth.users.last_sign_in_at 반환 (로그인/토큰 refresh 시각).';
