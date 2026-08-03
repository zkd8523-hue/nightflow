-- ============================================================================
-- Migration 502: 건의 소프트 삭제 RPC
-- 날짜: 2026-07-20
-- 설명:
--   클라이언트가 UPDATE suggestions SET is_deleted=true 로 삭제하는데,
--   admin이 '남의 글'을 지울 때 UPDATE 정책 WITH CHECK(author_id=auth.uid())에
--   걸려 "new row violates RLS" 로 실패함. 다른 admin 액션과 동일하게
--   SECURITY DEFINER RPC로 작성자·admin 권한을 검증해 처리한다.
-- ============================================================================

CREATE OR REPLACE FUNCTION soft_delete_suggestion(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID;
  v_author UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', '로그인이 필요해요');
  END IF;

  SELECT author_id INTO v_author FROM suggestions WHERE id = p_id AND is_deleted = false;
  IF v_author IS NULL THEN
    RETURN json_build_object('success', false, 'error', '글을 찾을 수 없어요');
  END IF;

  IF v_author <> v_uid AND NOT public.is_admin() THEN
    RETURN json_build_object('success', false, 'error', '작성자·관리자만 삭제할 수 있어요');
  END IF;

  UPDATE suggestions SET is_deleted = true, updated_at = now() WHERE id = p_id;
  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION soft_delete_suggestion(UUID) TO authenticated;
