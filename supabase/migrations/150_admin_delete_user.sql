-- ============================================================
-- Migration 150: Admin 강제 유저 삭제 RPC
-- ============================================================
-- 목적: 테스트 계정 정리 등을 위해 admin이 30일 grace period 없이
--       유저를 즉시 hard delete 할 수 있게 함.
-- 권한: SECURITY DEFINER + auth.uid() role='admin' 검증
-- 가드: admin 본인 삭제 차단, role='admin' 대상 삭제 차단
-- ============================================================

CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
  v_admin_role TEXT;
BEGIN
  -- 1. 호출자 admin 검증
  SELECT role INTO v_admin_role FROM users WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  -- 2. 자기 자신 삭제 차단
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;

  -- 3. 대상 유저 락
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_user IS NULL THEN
    RAISE EXCEPTION '사용자를 찾을 수 없습니다';
  END IF;

  -- 4. admin 대상 삭제 차단
  IF v_user.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot delete admin user';
  END IF;

  -- 5. nullable FK SET NULL (delete_user_account 071과 동일)
  UPDATE auctions SET winner_id = NULL WHERE winner_id = p_user_id;
  UPDATE auctions SET fallback_from_winner_id = NULL WHERE fallback_from_winner_id = p_user_id;
  UPDATE transactions SET confirmed_by = NULL WHERE confirmed_by = p_user_id;
  UPDATE transactions SET referrer_md_id = NULL WHERE referrer_md_id = p_user_id;
  UPDATE notification_logs SET recipient_user_id = NULL WHERE recipient_user_id = p_user_id;

  -- 6. NOT NULL FK 명시 정리 (CASCADE 안 걸린 것)
  DELETE FROM bids WHERE bidder_id = p_user_id;
  DELETE FROM transactions WHERE buyer_id = p_user_id;
  DELETE FROM transactions WHERE md_id = p_user_id;
  DELETE FROM auctions WHERE md_id = p_user_id;
  DELETE FROM settlement_logs WHERE md_id = p_user_id;
  DELETE FROM bank_verifications WHERE md_id = p_user_id;
  DELETE FROM deposit_logs WHERE md_id = p_user_id;
  -- clubs.md_id는 ON DELETE SET NULL이지만, 본인 명의 클럽도 같이 정리
  DELETE FROM clubs WHERE md_id = p_user_id;

  -- 7. user 본행 삭제 (CASCADE로 puzzle, vip, favorite, notification 등 자동 처리)
  DELETE FROM users WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'deleted_user_id', p_user_id,
    'deleted_display_name', v_user.display_name,
    'deleted_role', v_user.role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 권한
REVOKE ALL ON FUNCTION admin_delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_user(UUID) TO authenticated;
