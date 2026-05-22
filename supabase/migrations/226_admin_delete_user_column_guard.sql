-- ============================================================
-- Migration 226: admin_delete_user — 컬럼 존재 여부 가드 추가
-- ============================================================
-- 배경: Migration 182에서 clubs.md_id 컬럼이 제거됐으나(club_partners 조인 테이블 전환),
--       admin_delete_user RPC는 여전히 DELETE FROM clubs WHERE md_id = ... 를 실행하여
--       "column md_id does not exist" 오류 발생.
-- 해결: information_schema.columns 로 컬럼 존재 여부를 확인한 뒤 동적 SQL로 실행.
--       club_partners(ON DELETE CASCADE) 가 user 삭제 시 자동 정리하므로 별도 처리 불필요.
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

  -- 5. nullable FK SET NULL (필수 테이블 — 컬럼은 그대로 존재)
  UPDATE auctions SET winner_id = NULL WHERE winner_id = p_user_id;
  UPDATE auctions SET fallback_from_winner_id = NULL WHERE fallback_from_winner_id = p_user_id;

  -- notification_logs는 존재 시에만
  IF to_regclass('public.notification_logs') IS NOT NULL THEN
    EXECUTE 'UPDATE notification_logs SET recipient_user_id = NULL WHERE recipient_user_id = $1' USING p_user_id;
  END IF;

  -- transactions
  IF to_regclass('public.transactions') IS NOT NULL THEN
    EXECUTE 'UPDATE transactions SET confirmed_by = NULL WHERE confirmed_by = $1' USING p_user_id;
    EXECUTE 'UPDATE transactions SET referrer_md_id = NULL WHERE referrer_md_id = $1' USING p_user_id;
    EXECUTE 'DELETE FROM transactions WHERE buyer_id = $1' USING p_user_id;
    EXECUTE 'DELETE FROM transactions WHERE md_id = $1' USING p_user_id;
  END IF;

  -- 6. NOT NULL FK 명시 정리 — bids는 항상 존재
  DELETE FROM bids WHERE bidder_id = p_user_id;

  -- auctions.md_id 는 항상 존재 (NOT NULL)
  DELETE FROM auctions WHERE md_id = p_user_id;

  -- 7. clubs.md_id — Migration 182 이후 제거된 환경에서는 SKIP
  --    club_partners(ON DELETE CASCADE)가 users 삭제 시 자동으로 관계 정리
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clubs' AND column_name = 'md_id'
  ) THEN
    EXECUTE 'DELETE FROM clubs WHERE md_id = $1' USING p_user_id;
  END IF;

  -- 8. 선택 테이블 — 테이블 존재 + md_id 컬럼 존재 시에만
  IF to_regclass('public.settlement_logs') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='settlement_logs' AND column_name='md_id') THEN
    EXECUTE 'DELETE FROM settlement_logs WHERE md_id = $1' USING p_user_id;
  END IF;

  IF to_regclass('public.bank_verifications') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='bank_verifications' AND column_name='md_id') THEN
    EXECUTE 'DELETE FROM bank_verifications WHERE md_id = $1' USING p_user_id;
  END IF;

  IF to_regclass('public.deposit_logs') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='deposit_logs' AND column_name='md_id') THEN
    EXECUTE 'DELETE FROM deposit_logs WHERE md_id = $1' USING p_user_id;
  END IF;

  IF to_regclass('public.deposits') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='deposits' AND column_name='md_id') THEN
    EXECUTE 'DELETE FROM deposits WHERE md_id = $1' USING p_user_id;
  END IF;

  -- 9. user 본행 삭제 (CASCADE로 club_partners, puzzle, vip, favorite, notification 등 자동 처리)
  DELETE FROM users WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'deleted_user_id', p_user_id,
    'deleted_display_name', v_user.display_name,
    'deleted_role', v_user.role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION admin_delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_user(UUID) TO authenticated;
