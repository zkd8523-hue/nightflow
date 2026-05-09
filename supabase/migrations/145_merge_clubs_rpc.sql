-- ============================================
-- Migration 145: Admin 클럽 병합 RPC
-- ============================================
-- 목적: 중복 클럽을 대표 클럽으로 일괄 병합
--   1. auctions.club_id 이전
--   2. users.default_club_id 이전
--   3. source 클럽 soft-delete
-- 트랜잭션: PL/pgSQL 함수 = implicit transaction (중간 실패 시 자동 롤백)
-- 권한: SECURITY DEFINER + auth.uid()로 admin 검증
-- ============================================

CREATE OR REPLACE FUNCTION merge_clubs(
  p_source_id UUID,
  p_target_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_admin_role TEXT;
  v_target_active BOOLEAN;
  v_source_active BOOLEAN;
  v_auction_count INT := 0;
  v_md_count INT := 0;
BEGIN
  -- Admin 권한 확인
  SELECT role INTO v_admin_role FROM users WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  -- 자기 자신에 병합 차단
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Cannot merge club into itself';
  END IF;

  -- 양쪽 클럽 활성 확인
  SELECT (deleted_at IS NULL) INTO v_target_active FROM clubs WHERE id = p_target_id;
  SELECT (deleted_at IS NULL) INTO v_source_active FROM clubs WHERE id = p_source_id;
  IF v_target_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Target club not found or already deleted';
  END IF;
  IF v_source_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Source club not found or already deleted';
  END IF;

  -- 1. 모든 auctions의 club_id를 대표로 이전
  UPDATE auctions SET club_id = p_target_id WHERE club_id = p_source_id;
  GET DIAGNOSTICS v_auction_count = ROW_COUNT;

  -- 2. default_club_id 이전 (이 클럽을 default로 쓰던 MD들)
  UPDATE users SET default_club_id = p_target_id WHERE default_club_id = p_source_id;
  GET DIAGNOSTICS v_md_count = ROW_COUNT;

  -- 3. source 클럽 soft-delete
  UPDATE clubs
  SET deleted_at = now(), deleted_by = auth.uid()
  WHERE id = p_source_id;

  RETURN json_build_object(
    'success', true,
    'merged_auctions', v_auction_count,
    'merged_mds', v_md_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 미리보기용 함수 (병합 전 영향 범위 확인)
CREATE OR REPLACE FUNCTION preview_merge_clubs(
  p_source_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_admin_role TEXT;
  v_auction_count INT := 0;
  v_md_count INT := 0;
BEGIN
  SELECT role INTO v_admin_role FROM users WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT COUNT(*) INTO v_auction_count FROM auctions WHERE club_id = p_source_id;
  SELECT COUNT(*) INTO v_md_count FROM users WHERE default_club_id = p_source_id;

  RETURN json_build_object(
    'auction_count', v_auction_count,
    'md_count', v_md_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
