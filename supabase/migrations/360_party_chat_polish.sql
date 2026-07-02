-- ============================================================================
-- Migration 360: 조각 채팅방 다듬기
-- 날짜: 2026-07-02
-- #3 delete_party_message: 본인 메시지 삭제(언센드)
-- #4 leave_puzzle: 자발적 나가기 시 "OOO님이 나갔어요" 시스템 메시지
-- #6 get_party_chats: 시스템 메시지는 안읽음으로 집계하지 않음
-- (번호 360 — 353/356/357/358이 share팀과 겹쳐 이 배치는 360부터 사용)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- #3 본인 메시지 삭제(소프트 삭제). 시스템 메시지는 삭제 불가.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_party_message(p_message_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_msg puzzle_party_messages%ROWTYPE;
BEGIN
  SELECT * INTO v_msg FROM puzzle_party_messages WHERE id = p_message_id;
  IF v_msg.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '메시지를 찾을 수 없습니다');
  END IF;
  IF v_msg.is_system THEN
    RETURN jsonb_build_object('success', false, 'error', '삭제할 수 없는 메시지예요');
  END IF;
  IF v_msg.sender_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 메시지만 삭제할 수 있어요');
  END IF;
  UPDATE puzzle_party_messages
    SET is_deleted = TRUE, content = '', media = '[]'::jsonb, shared_offer_id = NULL
    WHERE id = p_message_id;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION delete_party_message(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- #4 leave_puzzle: 나가기 시 단체방 시스템 메시지 (Migration 126 본문 + 메시지)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION leave_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_guest INTEGER;
  v_next_leader UUID;
  v_user_name TEXT;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 깃발입니다');
  END IF;

  SELECT guest_count INTO v_guest FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '참여 기록이 없습니다');
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
    INTO v_user_name FROM users WHERE id = auth.uid();

  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  UPDATE puzzles SET
    current_count = current_count - (1 + COALESCE(v_guest, 0))
  WHERE id = p_puzzle_id;

  -- 조각 단체방 시스템 메시지 (조각만; 깃발은 방 없음)
  IF v_puzzle.is_recruiting_party THEN
    INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL, v_user_name || '님이 나갔어요', TRUE);
  END IF;

  IF v_puzzle.leader_id = auth.uid() THEN
    SELECT user_id INTO v_next_leader
    FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id
    ORDER BY joined_at ASC
    LIMIT 1;

    IF v_next_leader IS NOT NULL THEN
      UPDATE puzzles SET leader_id = v_next_leader WHERE id = p_puzzle_id;

      INSERT INTO in_app_notifications (user_id, type, title, message)
      VALUES (
        v_next_leader,
        'puzzle_leader_changed',
        '방장이 되었습니다',
        '기존 방장이 깃발을 내려 회원님이 새 방장이 되었습니다. MD 제안을 확인해보세요!'
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

-- ----------------------------------------------------------------------------
-- #6 get_party_chats: 시스템 메시지는 안읽음에서 제외 (Migration 349 본문 + 필터)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_party_chats()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.last_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      p.id                AS puzzle_id,
      p.area              AS area,
      p.event_date        AS event_date,
      COALESCE(p.total_budget, p.budget_per_person * p.target_count) AS budget,
      p.current_count     AS member_count,
      (p.leader_id = auth.uid()) AS is_leader,
      p.status            AS puzzle_status,
      COALESCE(lm.content, '단체채팅이 열렸어요') AS last_content,
      COALESCE(lm.created_at, p.created_at) AS last_at,
      lm.sender_id        AS last_sender_id,
      EXISTS (
        SELECT 1 FROM puzzle_party_messages m2
        WHERE m2.puzzle_id = p.id
          AND m2.is_deleted = false
          AND m2.is_system = false                    -- 시스템 메시지는 안읽음 제외
          AND m2.sender_id IS DISTINCT FROM auth.uid()
          AND m2.created_at > COALESCE(
            (SELECT r.last_read_at FROM puzzle_party_reads r
              WHERE r.puzzle_id = p.id AND r.user_id = auth.uid()),
            'epoch'::timestamptz)
      ) AS unread
    FROM puzzles p
    LEFT JOIN LATERAL (
      SELECT content, created_at, sender_id
      FROM puzzle_party_messages
      WHERE puzzle_id = p.id AND is_deleted = false
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    WHERE p.is_recruiting_party = true
      AND is_party_participant(p.id, auth.uid())
  ) t;
$$;
GRANT EXECUTE ON FUNCTION get_party_chats() TO authenticated;
