-- ============================================================================
-- Migration 400: 조각 단체방 나가기 (역할별 동작)
-- 날짜: 2026-07-02
-- 파티 마이그레이션은 400번대로 분리 (share팀 365+ 와 영구 비충돌)
--
-- leave_party(p_puzzle_id): 호출자 역할에 따라
--  - MD(초대됨)   → 자기만 방에서 빠짐(슬롯 열림) + 시스템 메시지
--  - 방장          → 조각 취소(방 사라짐) + pending 오퍼 만료 + 전원 알림
--  - 파티원(멤버)  → 탈퇴 + 인원 감소 + "나갔어요" 시스템 메시지
-- ============================================================================

CREATE OR REPLACE FUNCTION leave_party(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle      puzzles%ROWTYPE;
  v_guest       INTEGER;
  v_name        TEXT;
  v_md_name     TEXT;
  v_club_name   TEXT;
  v_offer_id    UUID;
  v_rcpt        RECORD;
  v_next_leader UUID;
  v_next_name   TEXT;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF NOT v_puzzle.is_recruiting_party THEN
    RETURN jsonb_build_object('success', false, 'error', '조각이 아닙니다');
  END IF;

  -- 1) MD(초대됨) 자가 나가기 → 슬롯 열림
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid()) THEN
    SELECT offer_id INTO v_offer_id FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
    DELETE FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid();
    SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
      INTO v_md_name FROM users u WHERE u.id = auth.uid();
    SELECT c.name INTO v_club_name
      FROM puzzle_offers o LEFT JOIN clubs c ON c.id = o.club_id WHERE o.id = v_offer_id;
    INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL,
      btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너가 상담에서 나갔어요', TRUE);
    RETURN jsonb_build_object('success', true, 'role', 'md');
  END IF;

  -- 2) 방장 나가기 → 다음 멤버에게 방장 위임 (남은 멤버 없으면 조각 마감)
  IF v_puzzle.leader_id = auth.uid() THEN
    SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
      INTO v_name FROM users WHERE id = auth.uid();
    SELECT guest_count INTO v_guest FROM puzzle_members
      WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();

    -- 다음 방장 = 방장 제외 가장 오래 참여한 멤버
    SELECT user_id INTO v_next_leader FROM puzzle_members
      WHERE puzzle_id = p_puzzle_id AND user_id <> auth.uid()
      ORDER BY joined_at ASC LIMIT 1;

    -- 나가는 방장 제거 + 인원 감소
    DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
    UPDATE puzzles SET current_count = GREATEST(0, current_count - (1 + COALESCE(v_guest, 0)))
      WHERE id = p_puzzle_id;

    IF v_next_leader IS NOT NULL THEN
      -- 방장 위임
      UPDATE puzzles SET leader_id = v_next_leader WHERE id = p_puzzle_id;
      SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
        INTO v_next_name FROM users WHERE id = v_next_leader;
      INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
      VALUES (p_puzzle_id, NULL,
        v_name || '님이 나가고 ' || v_next_name || '님이 새 방장이 되었어요', TRUE);
      INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
      VALUES (v_next_leader, 'puzzle_leader_changed', '방장이 되었어요',
        '기존 방장이 나가 회원님이 새 방장이 되었어요. MD 상담을 이어가보세요!',
        '/party/' || p_puzzle_id);
      RETURN jsonb_build_object('success', true, 'role', 'leader_transferred');
    ELSE
      -- 남은 멤버 없음 → 마감
      UPDATE puzzles SET status = 'cancelled', cancelled_at = now(),
        cancelled_reason = COALESCE(cancelled_reason, '방장 나감')
        WHERE id = p_puzzle_id;
      UPDATE puzzle_offers SET status = 'expired', updated_at = now()
        WHERE puzzle_id = p_puzzle_id AND status = 'pending';
      INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
      VALUES (p_puzzle_id, NULL, '방장이 나가 조각이 마감되었어요', TRUE);
      -- 초대된 MD가 있으면 알림
      FOR v_rcpt IN
        SELECT md_id AS participant_id FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id
      LOOP
        INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
        VALUES (v_rcpt.participant_id, 'puzzle_cancelled', '조각이 마감됐어요',
          '방장이 나가면서 이 조각이 마감됐어요.', '/');
      END LOOP;
      RETURN jsonb_build_object('success', true, 'role', 'leader_cancelled');
    END IF;
  END IF;

  -- 3) 파티원(멤버) 나가기 → 인원 감소
  SELECT guest_count INTO v_guest FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
    INTO v_name FROM users WHERE id = auth.uid();

  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  UPDATE puzzles SET current_count = GREATEST(1, current_count - (1 + COALESCE(v_guest, 0)))
    WHERE id = p_puzzle_id;
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
  VALUES (p_puzzle_id, NULL, v_name || '님이 나갔어요', TRUE);

  RETURN jsonb_build_object('success', true, 'role', 'member');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION leave_party(UUID) TO authenticated;
