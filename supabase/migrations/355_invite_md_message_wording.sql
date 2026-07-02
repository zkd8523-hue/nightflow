-- ============================================================================
-- Migration 355: MD 초대 시스템 메시지 문구 변경
-- 날짜: 2026-07-02
-- 변경: "{클럽명} MD가 상담을 위해 들어왔어요"
--    → "{클럽명} {MD닉네임} 파트너가 상담을 위해 초대되었어요"
-- ============================================================================

CREATE OR REPLACE FUNCTION invite_md_to_party(p_puzzle_id UUID, p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle    puzzles%ROWTYPE;
  v_offer     puzzle_offers%ROWTYPE;
  v_md_name   TEXT;
  v_club_name TEXT;
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
  -- 다른 MD가 이미 초대돼 있으면 거부 (조각당 MD 1명). 바꾸려면 먼저 내보내야 함.
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      '이미 상담 중인 MD가 있어요. 먼저 내보낸 뒤 초대해주세요');
  END IF;

  INSERT INTO puzzle_party_md (puzzle_id, md_id, offer_id)
  VALUES (p_puzzle_id, v_offer.md_id, p_offer_id);

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
    INTO v_md_name FROM users u WHERE u.id = v_offer.md_id;
  SELECT name INTO v_club_name FROM clubs WHERE id = v_offer.club_id;

  -- 단체방 시스템 메시지: "{클럽명} {MD닉네임} 파트너가 상담을 위해 초대되었어요"
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
  VALUES (
    p_puzzle_id, NULL,
    btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너가 상담을 위해 초대되었어요',
    TRUE
  );
  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, v_offer.md_id, now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'party_md_invited',
    '단체채팅에 초대됐어요!',
    '방장이 상담을 위해 단체채팅에 초대했어요. 지금 대화를 시작해보세요!',
    '/party/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- release_party_md(): 방장이 초대된 MD를 단체방에서 내보내기 (교체 전 단계)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_party_md(p_puzzle_id UUID)
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
    FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  DELETE FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
    INTO v_md_name FROM users u WHERE u.id = v_md_id;
  SELECT c.name INTO v_club_name
    FROM puzzle_offers o LEFT JOIN clubs c ON c.id = o.club_id
    WHERE o.id = v_offer_id;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
  VALUES (
    p_puzzle_id, NULL,
    btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너 상담이 종료되었어요',
    TRUE
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION release_party_md(UUID) TO authenticated;
