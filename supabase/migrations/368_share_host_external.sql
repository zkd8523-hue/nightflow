-- ============================================================================
-- Migration 368: MD 직통 조각 — 방장(MD)이 "이미 찬 자리(외부 인원)" 즉석 조정
-- 날짜: 2026-07-05
-- 설명:
--   MD 직통 조각(host_is_md)에서 방장이 홈카드/상세에서 외부 인원을 +/- 로 조정.
--   방장의 puzzle_members.guest_count를 delta만큼 조정하고 current_count 재계산.
--   합류한 유저 자리는 못 뺌(방장 guest만 조정), target_count 초과 불가.
-- ============================================================================
CREATE OR REPLACE FUNCTION adjust_share_host_external(p_puzzle_id UUID, p_delta INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_puzzle       puzzles%ROWTYPE;
  v_leader_guest INTEGER;
  v_others       INTEGER;
  v_new_guest    INTEGER;
  v_new_current  INTEGER;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() OR NOT v_puzzle.host_is_md THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 조정할 수 있어요');
  END IF;

  -- 방장 본인의 현재 외부 인원(guest_count)
  SELECT COALESCE(guest_count, 0) INTO v_leader_guest
    FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = v_puzzle.leader_id;
  v_new_guest := GREATEST(0, COALESCE(v_leader_guest, 0) + p_delta);

  -- 방장 외 멤버(합류한 유저)의 좌석 합
  SELECT COALESCE(SUM(1 + guest_count), 0) INTO v_others
    FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id <> v_puzzle.leader_id;

  v_new_current := 1 + v_new_guest + v_others;
  IF v_new_current > v_puzzle.target_count THEN
    RETURN jsonb_build_object('success', false, 'error', '남은 자리를 초과했어요');
  END IF;

  UPDATE puzzle_members SET guest_count = v_new_guest
    WHERE puzzle_id = p_puzzle_id AND user_id = v_puzzle.leader_id;
  UPDATE puzzles SET current_count = v_new_current WHERE id = p_puzzle_id;

  RETURN jsonb_build_object('success', true, 'current_count', v_new_current);
END;
$$;
GRANT EXECUTE ON FUNCTION adjust_share_host_external(UUID, INTEGER) TO authenticated;
