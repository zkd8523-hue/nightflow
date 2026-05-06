-- ============================================================================
-- Migration 136: admin_cancel_puzzle() — 어드민 깃발 강제 취소
-- 날짜: 2026-05-07
-- 설명: cancel_puzzle()은 leader만 호출 가능. 어드민이 직접 깃발을 내릴 수
--       있도록 별도 admin 전용 함수 추가.
--       - pending 오퍼 → expired (MD 슬롯 회복)
--       - 참여자 알림 발송
--       - 어드민 권한 검증 포함
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

  IF v_puzzle.status NOT IN ('open', 'matched') THEN
    RETURN jsonb_build_object('success', false, 'error', '취소 가능한 상태가 아닙니다 (' || v_puzzle.status || ')');
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
