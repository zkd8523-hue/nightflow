-- ============================================================================
-- Migration 167: puzzles.cancelled_reason + cancelled_at 컬럼 추가
-- 날짜: 2026-05-15
-- 설명:
--   admin/방장이 깃발을 취소할 때 사유와 시각을 puzzles 테이블에 영구 저장.
--   in_app_notifications.message에만 남기던 정보를 깃발 상세 페이지에서도
--   조회 가능하도록 한다.
--
--   admin_cancel_puzzle: 사유(p_reason)와 cancelled_at을 저장.
--   cancel_puzzle (방장 자가 취소): cancelled_at만 저장 (사유 없음).
-- ============================================================================

ALTER TABLE puzzles
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- admin_cancel_puzzle: 사유와 시각을 puzzles에도 저장
CREATE OR REPLACE FUNCTION admin_cancel_puzzle(
  p_puzzle_id UUID,
  p_reason    TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_puzzle         puzzles%ROWTYPE;
  v_message        TEXT;
  v_trimmed_reason TEXT;
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

  v_trimmed_reason := NULLIF(trim(COALESCE(p_reason, '')), '');

  v_message := '관리자에 의해 깃발이 내려갔습니다.';
  IF v_trimmed_reason IS NOT NULL THEN
    v_message := v_message || ' 사유: ' || v_trimmed_reason;
  END IF;

  UPDATE puzzles
  SET status           = 'cancelled',
      cancelled_reason = v_trimmed_reason,
      cancelled_at     = now()
  WHERE id = p_puzzle_id;

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT user_id, 'puzzle_cancelled', '깃발 취소', v_message,
    '/flags/' || p_puzzle_id
  FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id;

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

-- cancel_puzzle (방장 자가 취소, Migration 126): cancelled_at만 기록 (사유 없음)
CREATE OR REPLACE FUNCTION cancel_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;
  IF (SELECT status FROM puzzles WHERE id = p_puzzle_id) != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 종료된 깃발입니다');
  END IF;

  UPDATE puzzles
  SET status       = 'cancelled',
      cancelled_at = now()
  WHERE id = p_puzzle_id;

  INSERT INTO in_app_notifications (user_id, type, title, message)
  SELECT user_id, 'puzzle_cancelled', '깃발 취소', '참여하신 깃발이 내려갔습니다.'
  FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id AND user_id != auth.uid();

  UPDATE puzzle_offers SET status = 'expired', updated_at = now()
  WHERE puzzle_id = p_puzzle_id AND status = 'pending';

  UPDATE users SET md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (SELECT md_id FROM puzzle_offers WHERE puzzle_id = p_puzzle_id);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
