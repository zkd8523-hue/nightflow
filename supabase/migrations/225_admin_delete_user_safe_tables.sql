-- ============================================================
-- Migration 225: admin_delete_user 안전화 (존재하지 않는 테이블 처리)
-- ============================================================
-- 배경: Migration 150은 settlement_logs, deposit_logs, bank_verifications
--       등을 직접 DELETE 하는데, Model B 전환 이후 일부 환경에서는
--       이 테이블들이 생성되지 않아 "relation does not exist" 오류 발생.
-- 해결: to_regclass()로 테이블 존재 여부를 확인한 뒤 동적 SQL로 DELETE.
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

  -- 5. nullable FK SET NULL (필수 테이블)
  UPDATE auctions SET winner_id = NULL WHERE winner_id = p_user_id;
  UPDATE auctions SET fallback_from_winner_id = NULL WHERE fallback_from_winner_id = p_user_id;

  -- notification_logs는 존재 시에만
  IF to_regclass('public.notification_logs') IS NOT NULL THEN
    EXECUTE 'UPDATE notification_logs SET recipient_user_id = NULL WHERE recipient_user_id = $1' USING p_user_id;
  END IF;

  -- transactions는 존재 시에만 (Model B에서 미사용 가능)
  IF to_regclass('public.transactions') IS NOT NULL THEN
    EXECUTE 'UPDATE transactions SET confirmed_by = NULL WHERE confirmed_by = $1' USING p_user_id;
    EXECUTE 'UPDATE transactions SET referrer_md_id = NULL WHERE referrer_md_id = $1' USING p_user_id;
    EXECUTE 'DELETE FROM transactions WHERE buyer_id = $1' USING p_user_id;
    EXECUTE 'DELETE FROM transactions WHERE md_id = $1' USING p_user_id;
  END IF;

  -- 6. NOT NULL FK 명시 정리 — bids, auctions, clubs는 필수
  DELETE FROM bids WHERE bidder_id = p_user_id;
  DELETE FROM auctions WHERE md_id = p_user_id;
  DELETE FROM clubs WHERE md_id = p_user_id;

  -- 7. 선택 테이블 — 존재 시에만 동적 DELETE
  IF to_regclass('public.settlement_logs') IS NOT NULL THEN
    EXECUTE 'DELETE FROM settlement_logs WHERE md_id = $1' USING p_user_id;
  END IF;

  IF to_regclass('public.bank_verifications') IS NOT NULL THEN
    EXECUTE 'DELETE FROM bank_verifications WHERE md_id = $1' USING p_user_id;
  END IF;

  IF to_regclass('public.deposit_logs') IS NOT NULL THEN
    EXECUTE 'DELETE FROM deposit_logs WHERE md_id = $1' USING p_user_id;
  END IF;

  IF to_regclass('public.deposits') IS NOT NULL THEN
    EXECUTE 'DELETE FROM deposits WHERE md_id = $1' USING p_user_id;
  END IF;

  -- 8. user 본행 삭제 (CASCADE로 puzzle, vip, favorite, notification 등 자동 처리)
  DELETE FROM users WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'deleted_user_id', p_user_id,
    'deleted_display_name', v_user.display_name,
    'deleted_role', v_user.role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 권한 재부여
REVOKE ALL ON FUNCTION admin_delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_user(UUID) TO authenticated;
