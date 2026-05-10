-- ============================================================================
-- Migration 154: admin_cancel_puzzle — 모든 활성 상태 취소 허용
-- 날짜: 2026-05-11
-- 설명:
--   기존 admin_cancel_puzzle()은 'open', 'matched' 상태만 허용.
--   'accepted' 상태 깃발(낙찰 후 방문 대기 중)도 admin이 내릴 수 있어야 함.
--   이미 종료된 상태(cancelled, expired)만 제외.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_cancel_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
BEGIN
  IF (SELECT role FROM users WHERE id = auth.uid()) != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자만 사용할 수 있습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;

  IF v_puzzle.status IN ('cancelled', 'expired') THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 종료된 깃발입니다 (' || v_puzzle.status || ')');
  END IF;

  UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

  -- 참여자 알림
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT user_id, 'puzzle_cancelled', '깃발 취소', '참여하신 깃발이 내려갔습니다.',
    '/flags/' || p_puzzle_id
  FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id;

  -- pending 오퍼 만료 + MD 슬롯 회복
  UPDATE puzzle_offers SET status = 'expired', updated_at = now()
  WHERE puzzle_id = p_puzzle_id AND status = 'pending';

  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND status = 'expired'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
