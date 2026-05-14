-- ============================================================================
-- Migration 165: admin_cancel_puzzle — 취소 사유 파라미터 추가
-- 날짜: 2026-05-14
-- 설명:
--   admin이 깃발을 강제 취소할 때 사유(p_reason)를 입력하면
--   참여자에게 발송되는 인앱 알림 메시지에 포함된다.
--   p_reason이 NULL이면 기존 기본 메시지 사용.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_cancel_puzzle(
  p_puzzle_id UUID,
  p_reason    TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_puzzle  puzzles%ROWTYPE;
  v_message TEXT;
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

  -- 알림 메시지 조합
  v_message := '관리자에 의해 깃발이 내려갔습니다.';
  IF p_reason IS NOT NULL AND trim(p_reason) != '' THEN
    v_message := v_message || ' 사유: ' || trim(p_reason);
  END IF;

  UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

  -- 참여자 전원 알림 (방장 포함)
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT user_id, 'puzzle_cancelled', '깃발 취소', v_message,
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
