-- ============================================================================
-- Migration 591: 다중 파트너(MD) 파티 채팅 — Phase 3 함수
-- 날짜: 2026-08-27
-- ============================================================================

-- ----------------------------------------------------------------------------
-- a) invite_md_to_party: 두 번째 파트너 초대 거부 로직 제거 (476 기반)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invite_md_to_party(p_puzzle_id UUID, p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle    puzzles%ROWTYPE;
  v_offer     puzzle_offers%ROWTYPE;
  v_label     TEXT;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 초대할 수 있어요');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL OR v_offer.puzzle_id <> p_puzzle_id THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  -- 이미 같은 MD면 그대로 성공(멱등)
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = v_offer.md_id) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;
  -- ⭐ 다중 파트너 허용: "다른 MD가 이미 초대돼 있으면 거부" 블록 제거 (기존 476 라인 32-36)

  -- 등록만(무료). 크레딧은 MD 동의 시점(start_party_consultation)에 차감.
  INSERT INTO puzzle_party_md (puzzle_id, md_id, offer_id)
  VALUES (p_puzzle_id, v_offer.md_id, p_offer_id);

  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, v_offer.md_id, now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'party_md_invited',
    '상담 요청이 왔어요!',
    '방장이 단체채팅 상담에 초대했어요. 입장해서 상담을 시작해보세요!',
    '/party/' || p_puzzle_id
  );

  -- 앱 푸시 (인앱만으론 앱 미실행 시 인지 불가)
  v_label := COALESCE(v_puzzle.area, '') || ' '
             || EXTRACT(MONTH FROM v_puzzle.event_date)::TEXT || '/' || EXTRACT(DAY FROM v_puzzle.event_date)::TEXT;
  PERFORM notify_user_push(
    v_offer.md_id,
    '🎉 상담 요청이 왔어요!',
    btrim(v_label) || ' 조각 · 입장해서 상담을 시작해보세요',
    jsonb_build_object('type','party_md_invited','puzzle_id',p_puzzle_id::TEXT),
    '/party/' || p_puzzle_id::TEXT,
    'chat'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- b) start_party_consultation: md_id로 스코프 (431 기반)
--    이전: SELECT/UPDATE가 puzzle_id만으로 걸려 있어 다중 MD 시 임의 행을 집거나
--    전원을 동의 처리했다. 시스템 메시지는 그 MD의 room_md_id에 붙인다.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_party_consultation(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_pm        puzzle_party_md%ROWTYPE;
  v_offer     puzzle_offers%ROWTYPE;
  v_cost      INTEGER;
  v_md_name   TEXT;
  v_club_name TEXT;
  v_charged   BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_pm FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid();
  IF v_pm.puzzle_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '초대 정보를 찾을 수 없어요');
  END IF;

  -- 이미 동의했으면 멱등 성공
  IF v_pm.consented_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = v_pm.offer_id;
  v_cost := puzzle_match_credit_cost(p_puzzle_id);

  -- 과금 (초대/즉시수락 중 먼저 온 쪽 1회만; 잔액<0 허용 = 외상 1매치분)
  IF v_offer.id IS NOT NULL AND v_offer.charged_at IS NULL THEN
    UPDATE users SET md_credits = md_credits - v_cost WHERE id = v_pm.md_id;
    UPDATE puzzle_offers SET charged_at = now() WHERE id = v_offer.id;
    v_charged := TRUE;
  END IF;

  UPDATE puzzle_party_md SET consented_at = now()
    WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid();

  -- 공개 시스템 메시지: 이 MD의 방에 붙인다
  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
    INTO v_md_name FROM users u WHERE u.id = v_pm.md_id;
  SELECT name INTO v_club_name FROM clubs WHERE id = v_offer.club_id;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system, room_md_id)
  VALUES (
    p_puzzle_id, NULL,
    btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너가 상담을 시작했어요',
    TRUE, v_pm.md_id
  );

  RETURN jsonb_build_object('success', true, 'charged', v_charged, 'cost', v_cost);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- c) decline_party_consultation: md_id로 스코프 (431 기반)
--    ⚠️ 기존은 DELETE ... WHERE puzzle_id = p_puzzle_id 라서 한 MD가 거절하면
--    전원이 삭제됐다. AND md_id = auth.uid() 를 추가해 본인 행만 지운다.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION decline_party_consultation(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_pm      puzzle_party_md%ROWTYPE;
  v_leader  UUID;
BEGIN
  SELECT * INTO v_pm FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid();
  IF v_pm.puzzle_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '초대 정보를 찾을 수 없어요');
  END IF;
  IF v_pm.consented_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 상담을 시작해 거절할 수 없어요');
  END IF;

  SELECT leader_id INTO v_leader FROM puzzles WHERE id = p_puzzle_id;

  -- 오퍼 철회 (재초대 불가 — MD가 다시 오퍼해야 함)
  IF v_pm.offer_id IS NOT NULL THEN
    UPDATE puzzle_offers
    SET status = 'withdrawn', updated_at = now()
    WHERE id = v_pm.offer_id AND status = 'pending';
    UPDATE users SET
      md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
    WHERE id = v_pm.md_id;
  END IF;

  -- 파티 MD 해제(본인 행만) + MD의 read 마커 제거
  DELETE FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid();
  DELETE FROM puzzle_party_reads WHERE puzzle_id = p_puzzle_id AND user_id = v_pm.md_id;

  -- 방장 알림
  IF v_leader IS NOT NULL THEN
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_leader,
      'party_md_released',
      '초대한 파트너가 상담을 시작하지 않았어요',
      '초대한 파트너가 상담을 시작하지 않았어요. 다른 파트너를 초대해보세요.',
      '/party/' || p_puzzle_id
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- d) release_party_md: p_md_id 인자를 받는 2-arg 오버로드 신규 생성 (364 기반)
--    프론트 배포 후 1-arg 버전은 별도 DROP (남겨두면 전원 퇴장 지뢰).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_party_md(p_puzzle_id UUID, p_md_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle    puzzles%ROWTYPE;
  v_md_id     UUID;
  v_offer_id  UUID;
  v_md_name   TEXT;
  v_club_name TEXT;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 내보낼 수 있어요');
  END IF;

  SELECT md_id, offer_id INTO v_md_id, v_offer_id
    FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = p_md_id;
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  DELETE FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = p_md_id;

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
    INTO v_md_name FROM users u WHERE u.id = v_md_id;
  SELECT c.name INTO v_club_name
    FROM puzzle_offers o LEFT JOIN clubs c ON c.id = o.club_id
    WHERE o.id = v_offer_id;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system, room_md_id)
  VALUES (
    p_puzzle_id, NULL,
    btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너 상담이 종료되었어요',
    TRUE, v_md_id
  );

  -- MD에게 상담 종료 알림
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_md_id,
    'party_md_released',
    '상담이 종료됐어요',
    '방장이 조각 단체채팅 상담을 종료했어요.',
    '/'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION release_party_md(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- e) leave_party: MD 자가 나가기 분기만 md_id로 스코프 (556 기반, 전체 재정의)
--    ⚠️ 기존 SELECT offer_id INTO ... WHERE puzzle_id = p_puzzle_id 가
--    md_id 조건 없이 걸려있어 다중 MD 시 엉뚱한 클럽명이 나갈 수 있었다.
--    방장/멤버 분기는 원문 그대로 보존.
-- ----------------------------------------------------------------------------
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

  -- 1) MD(초대됨) 자가 나가기 → 슬롯 열림 (본인 행만 조회/삭제)
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid()) THEN
    SELECT offer_id INTO v_offer_id FROM puzzle_party_md
      WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid();
    DELETE FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid();
    SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
      INTO v_md_name FROM users u WHERE u.id = auth.uid();
    SELECT c.name INTO v_club_name
      FROM puzzle_offers o LEFT JOIN clubs c ON c.id = o.club_id WHERE o.id = v_offer_id;
    INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system, room_md_id)
    VALUES (p_puzzle_id, NULL,
      btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너가 상담에서 나갔어요', TRUE, auth.uid());
    RETURN jsonb_build_object('success', true, 'role', 'md');
  END IF;

  -- 2) 방장 나가기 → 다음 멤버에게 방장 위임 (남은 멤버 없으면 조각 마감)
  IF v_puzzle.leader_id = auth.uid() THEN
    SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
      INTO v_name FROM users WHERE id = auth.uid();
    SELECT guest_count INTO v_guest FROM puzzle_members
      WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();

    SELECT user_id INTO v_next_leader FROM puzzle_members
      WHERE puzzle_id = p_puzzle_id AND user_id <> auth.uid()
      ORDER BY joined_at ASC LIMIT 1;

    DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
    UPDATE puzzles SET current_count = GREATEST(0, current_count - (1 + COALESCE(v_guest, 0)))
      WHERE id = p_puzzle_id;
    INSERT INTO puzzle_membership_events (puzzle_id, user_id, event_type, actor_id)
      VALUES (p_puzzle_id, auth.uid(), 'left', auth.uid());

    IF v_next_leader IS NOT NULL THEN
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
      UPDATE puzzles SET status = 'cancelled', cancelled_at = now(),
        cancelled_reason = COALESCE(cancelled_reason, '방장 나감')
        WHERE id = p_puzzle_id;
      UPDATE puzzle_offers SET status = 'expired', updated_at = now()
        WHERE puzzle_id = p_puzzle_id AND status = 'pending';
      INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
      VALUES (p_puzzle_id, NULL, '방장이 나가 조각이 마감되었어요', TRUE);
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
  INSERT INTO puzzle_membership_events (puzzle_id, user_id, event_type, actor_id)
    VALUES (p_puzzle_id, auth.uid(), 'left', auth.uid());
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
  VALUES (p_puzzle_id, NULL, v_name || '님이 나갔어요', TRUE);

  RETURN jsonb_build_object('success', true, 'role', 'member');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- f) send_party_message: p_room_md_id 추가 + 방별 수신자 분기 (362 기반)
--    ⚠️ 기존은 모든 MD에게 푸시가 갔다(SECURITY DEFINER 내부 계산이라 RLS 우회).
--    기존 4-arg는 DROP하고 5-arg로 재정의 — 프론트도 함께 배포해야 한다.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS send_party_message(UUID, TEXT, JSONB, UUID);

CREATE OR REPLACE FUNCTION send_party_message(
  p_puzzle_id  UUID,
  p_content    TEXT,
  p_media      JSONB DEFAULT '[]'::jsonb,
  p_reply_to   UUID DEFAULT NULL,
  p_room_md_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_puzzle      puzzles%ROWTYPE;
  v_msg_id      UUID;
  v_sender_name TEXT;
  v_recipient   RECORD;
BEGIN
  IF COALESCE(btrim(p_content), '') = '' AND COALESCE(jsonb_array_length(p_media), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '내용을 입력해주세요');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF NOT can_see_party_room(p_puzzle_id, p_room_md_id, auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;
  IF v_puzzle.status IN ('expired', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 조각입니다');
  END IF;

  -- 인용 대상이 같은 조각·같은 방의 메시지가 아니면 무시
  IF p_reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM puzzle_party_messages
    WHERE id = p_reply_to AND puzzle_id = p_puzzle_id
      AND room_md_id IS NOT DISTINCT FROM p_room_md_id
  ) THEN
    p_reply_to := NULL;
  END IF;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, media, reply_to, room_md_id)
  VALUES (p_puzzle_id, auth.uid(), COALESCE(p_content, ''), COALESCE(p_media, '[]'::jsonb), p_reply_to, p_room_md_id)
  RETURNING id INTO v_msg_id;

  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, auth.uid(), now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '멤버')
    INTO v_sender_name FROM users u WHERE u.id = auth.uid();

  -- 방별 수신자: 파티원방(NULL)은 방장+멤버만. MD 방은 그 MD + 방장+멤버.
  -- 다른 MD에게는 절대 푸시가 가지 않는다.
  FOR v_recipient IN
    SELECT participant_id FROM (
      SELECT leader_id AS participant_id FROM puzzles WHERE id = p_puzzle_id
      UNION
      SELECT user_id FROM puzzle_members WHERE puzzle_id = p_puzzle_id
      UNION
      SELECT md_id FROM puzzle_party_md
        WHERE puzzle_id = p_puzzle_id AND p_room_md_id IS NOT NULL AND md_id = p_room_md_id
    ) parts
    WHERE participant_id <> auth.uid()
  LOOP
    PERFORM notify_user_push(
      v_recipient.participant_id,
      '💬 ' || v_sender_name,
      left(COALESCE(NULLIF(btrim(p_content), ''), '사진을 보냈어요'), 40),
      jsonb_build_object('type', 'party_chat', 'puzzle_id', p_puzzle_id::text),
      '/party/' || p_puzzle_id::text,
      'chat'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION send_party_message(UUID, TEXT, JSONB, UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- g) share_offer_to_party: p_room_md_id 추가 (363 기반)
--    오퍼 카드는 파티원방에만 공유되게 한다 — 경쟁 파트너에게 남의 조건이
--    가면 안 되므로 p_room_md_id가 NULL(파티원방)일 때만 허용한다.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS share_offer_to_party(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION share_offer_to_party(
  p_puzzle_id  UUID,
  p_offer_id   UUID,
  p_content    TEXT DEFAULT '이거 어때요? 👀',
  p_room_md_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_puzzle      puzzles%ROWTYPE;
  v_msg_id      UUID;
  v_sender_name TEXT;
  v_recipient   RECORD;
BEGIN
  IF p_room_md_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼 카드는 파티원방에서만 공유할 수 있어요');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF NOT can_see_party_room(p_puzzle_id, p_room_md_id, auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;
  IF v_puzzle.status IN ('expired', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 조각입니다');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM puzzle_offers WHERE id = p_offer_id AND puzzle_id = p_puzzle_id) THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, shared_offer_id, room_md_id)
  VALUES (p_puzzle_id, auth.uid(), COALESCE(NULLIF(btrim(p_content), ''), '이거 어때요? 👀'), p_offer_id, p_room_md_id)
  RETURNING id INTO v_msg_id;

  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, auth.uid(), now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '멤버')
    INTO v_sender_name FROM users u WHERE u.id = auth.uid();

  -- 파티원방 전용이므로 방장+멤버에게만 (MD에게는 절대 안 감)
  FOR v_recipient IN
    SELECT participant_id FROM (
      SELECT leader_id AS participant_id FROM puzzles WHERE id = p_puzzle_id
      UNION SELECT user_id FROM puzzle_members WHERE puzzle_id = p_puzzle_id
    ) parts
    WHERE participant_id <> auth.uid()
  LOOP
    PERFORM notify_user_push(
      v_recipient.participant_id,
      '💬 ' || v_sender_name,
      '오퍼를 공유했어요',
      jsonb_build_object('type', 'party_chat', 'puzzle_id', p_puzzle_id::text),
      '/party/' || p_puzzle_id::text,
      'chat'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION share_offer_to_party(UUID, UUID, TEXT, UUID) TO authenticated;
