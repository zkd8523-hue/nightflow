-- Migration 224: admin/puzzles 페이지에서 기록을 완전 삭제(Hard Delete)할 수 있는 RPC들
-- 모두 admin role만 호출 가능. SECURITY DEFINER로 RLS 우회.
-- CASCADE FK로 puzzles 삭제 시 자식(puzzle_offers, puzzle_reports, puzzle_interests,
-- puzzle_offer_reveals, puzzle_content_reports, puzzle_cancellation_surveys, notification_logs 등)
-- 자동 정리됨.

----------------------------------------------------------------------
-- 1) 깃발(puzzle) 자체 완전 삭제
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_delete_puzzle(p_puzzle_id UUID)
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

  DELETE FROM puzzles WHERE id = p_puzzle_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN json_build_object('success', false, 'error', 'puzzle not found');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_puzzle(UUID) TO authenticated;

----------------------------------------------------------------------
-- 2) 제안(puzzle_offer) 완전 삭제
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_delete_puzzle_offer(p_offer_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_deleted INT;
  v_accepted_id UUID;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RETURN json_build_object('success', false, 'error', 'admin only');
  END IF;

  -- 만약 이 offer가 어떤 puzzle의 accepted_offer_id로 지정돼 있다면 먼저 null 처리
  -- (FK는 ON DELETE SET NULL이지만 명시적으로 안전 처리)
  UPDATE puzzles SET accepted_offer_id = NULL WHERE accepted_offer_id = p_offer_id;

  DELETE FROM puzzle_offers WHERE id = p_offer_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN json_build_object('success', false, 'error', 'offer not found');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_puzzle_offer(UUID) TO authenticated;

----------------------------------------------------------------------
-- 3) 신고(puzzle_report) 1건 삭제
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_delete_puzzle_report(p_report_id UUID)
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

  DELETE FROM puzzle_reports WHERE id = p_report_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN json_build_object('success', false, 'error', 'report not found');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_puzzle_report(UUID) TO authenticated;

----------------------------------------------------------------------
-- 4) 노쇼 신고 큐에서 해당 offer 자체를 삭제 (강한 액션)
--    admin/puzzle-noshow-reports 페이지에서 사용
--    (기존 admin_apply_puzzle_strike / dismiss와 별개로, 기록 자체 제거)
----------------------------------------------------------------------
-- 별도 함수 불필요: admin_delete_puzzle_offer 재사용
