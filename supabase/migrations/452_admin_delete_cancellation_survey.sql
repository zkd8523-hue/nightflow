-- ============================================================================
-- Migration 452: 취소/노매치 설문 응답 개별 삭제 RPC (admin 전용)
-- 날짜: 2026-07-12
-- 설명:
--   admin/puzzles?tab=surveys 응답 리스트에서 테스트/오염 데이터를 개별 삭제.
--   Migration 224의 admin_delete_* 패턴과 동일 (SECURITY DEFINER, admin role만).
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_delete_cancellation_survey(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_deleted INT;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RETURN json_build_object('success', false, 'error', 'admin only');
  END IF;

  DELETE FROM puzzle_cancellation_surveys WHERE id = p_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN json_build_object('success', false, 'error', 'survey not found');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_cancellation_survey(UUID) TO authenticated;
