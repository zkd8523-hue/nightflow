-- ============================================================================
-- Migration 207: 고아 identity (kakao_id) 정리 RPC
-- 날짜: 2026-05-19
--
-- 배경:
--   Apple/Kakao OAuth 재가입 시, auth.users는 새 id로 생성되지만
--   public.users 잔재 row가 동일 provider sub(kakao_id)를 보유 중이면
--   신규 INSERT가 idx_users_kakao_id UNIQUE 제약에 막힌다.
--
--   public.users는 auth.users와 FK가 없어 cascade 되지 않으므로
--   admin.deleteUser 호출 후에도 잔재가 남는다.
--
-- 정책:
--   - 본인 row(auth.uid())는 절대 건드리지 않음
--   - auth.users에 더 이상 존재하지 않는(=orphan) public.users만 정리
--   - row 자체는 살리고 kakao_id만 NULL로 (FK·통계·history 보존)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reclaim_orphan_kakao_id(p_kakao_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_kakao_id IS NULL OR length(p_kakao_id) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.users u
  SET kakao_id = NULL
  WHERE u.kakao_id = p_kakao_id
    AND u.id <> auth.uid()
    AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reclaim_orphan_kakao_id(TEXT) TO authenticated;

COMMENT ON FUNCTION public.reclaim_orphan_kakao_id(TEXT) IS
  'OAuth 재가입 시 같은 provider sub를 가진 고아 public.users(auth 미존재) 의 kakao_id를 해제. 본인 row는 건드리지 않음.';
