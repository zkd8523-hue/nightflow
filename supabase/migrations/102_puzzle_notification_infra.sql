-- ============================================================================
-- Migration 102: 퍼즐 알림톡 인프라
-- 날짜: 2026-04-15
-- 설명: 퍼즐 V2 5가지 알림톡 트리거를 위한 DB 인프라
--       1. puzzles.leader_changed_at — 방장 위임 감지용
--       2. notification_logs.puzzle_id — 중복 발송 방지용
--       3. notification_logs event_type 제약 확장
--       4. leave_puzzle() 재정의 — leader_changed_at 기록 추가
-- ============================================================================

-- ============================================================================
-- 1. puzzles.leader_changed_at
-- ============================================================================
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS leader_changed_at TIMESTAMPTZ;

-- ============================================================================
-- 2. notification_logs.puzzle_id
-- ============================================================================
ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS puzzle_id UUID REFERENCES puzzles(id) ON DELETE CASCADE;

-- ============================================================================
-- 3. notification_logs event_type 제약 확장
-- ============================================================================
ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_event_type_check;

ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_event_type_check
  CHECK (event_type IN (
    'auction_started', 'auction_won', 'visit_confirmed', 'outbid',
    'closing_soon', 'noshow_penalty', 'contact_deadline_warning',
    'fallback_won', 'earlybird_dday_reminder', 'auction_contact_expired',
    'new_auction_in_area',
    'puzzle_first_offer',
    'puzzle_deadline_reminder',
    'puzzle_leader_changed',
    'puzzle_matched',
    'puzzle_offer_won'
  ));

-- ============================================================================
-- 3-b. notification_logs puzzle_id 인덱스
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_notify_logs_puzzle
  ON notification_logs(puzzle_id, event_type, status);

-- ============================================================================
-- 4. leave_puzzle() 재정의
--    기존 Migration 101 로직 완전 보존
--    방장 위임 시 leader_changed_at = now() 추가
-- ============================================================================
CREATE OR REPLACE FUNCTION leave_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_guest INTEGER;
  v_next_leader UUID;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '퍼즐을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 퍼즐입니다');
  END IF;

  SELECT guest_count INTO v_guest FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '참여 기록이 없습니다');
  END IF;

  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  UPDATE puzzles SET
    current_count = current_count - (1 + COALESCE(v_guest, 0))
  WHERE id = p_puzzle_id;

  IF v_puzzle.leader_id = auth.uid() THEN
    SELECT user_id INTO v_next_leader
    FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id
    ORDER BY joined_at ASC
    LIMIT 1;

    IF v_next_leader IS NOT NULL THEN
      -- 방장 위임 + leader_changed_at 기록 (알림톡 트리거용)
      UPDATE puzzles SET
        leader_id = v_next_leader,
        leader_changed_at = now()
      WHERE id = p_puzzle_id;

      INSERT INTO in_app_notifications (user_id, type, title, message)
      VALUES (
        v_next_leader,
        'puzzle_leader_changed',
        '방장이 되었습니다',
        '기존 방장이 퍼즐을 떠나 회원님이 새 방장이 되었습니다. MD 제안을 확인해보세요!'
      );
    ELSE
      UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

      UPDATE puzzle_offers SET status = 'expired', updated_at = now()
      WHERE puzzle_id = p_puzzle_id AND status = 'pending';

      UPDATE users SET
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id IN (
        SELECT md_id FROM puzzle_offers
        WHERE puzzle_id = p_puzzle_id AND status = 'expired'
          AND updated_at > now() - INTERVAL '1 second'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
