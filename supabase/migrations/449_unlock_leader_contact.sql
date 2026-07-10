-- ============================================================================
-- Migration 449: 유저 연락처 열람 과금 (플랫폼 우회 차단)
-- 날짜: 2026-07-11
-- 배경:
--   유저가 채팅 시작하며 본인 연락처를 남기면, MD가 답장 없이 연락처만 보고 이탈해
--   앱 밖에서 직접 연락 → 매치 과금(첫 답장 15크레딧)이 생략되는 우회가 생김.
-- 해결:
--   오퍼당 매치 비용 1회 = "첫 답장" 또는 "연락처 열람" 중 먼저 오는 것.
--   - md_contact_unlocked_at 컬럼 추가
--   - unlock_leader_contact(): MD가 방장 연락처 카드를 열람할 때 과금 + 마킹
--   - send_offer_message() 첫 답장 과금 조건에 "아직 열람과금 안 됨" 추가 (이중과금 방지)
-- ============================================================================

ALTER TABLE puzzle_offers ADD COLUMN IF NOT EXISTS md_contact_unlocked_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 연락처 열람 = 매치 비용 차감 (첫 답장과 동일 비용, 오퍼당 1회)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION unlock_leader_contact(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer        puzzle_offers%ROWTYPE;
  v_puzzle       puzzles%ROWTYPE;
  v_md           users%ROWTYPE;
  v_md_msg_count INT;
  v_cost         INT;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;
  IF auth.uid() <> v_offer.md_id THEN
    RETURN jsonb_build_object('success', false, 'error', '해당 파트너만 열람할 수 있어요');
  END IF;

  -- 이미 과금됨(이전 열람 또는 첫 답장) → 무료 열람
  SELECT count(*) INTO v_md_msg_count FROM puzzle_offer_messages
    WHERE offer_id = p_offer_id AND sender_id = v_offer.md_id;
  IF v_offer.md_contact_unlocked_at IS NOT NULL OR v_md_msg_count > 0 OR v_offer.status <> 'pending' THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;

  -- 방장이 실제로 연락처 카드를 남겼는지 확인 (없으면 과금 안 함)
  IF NOT EXISTS (
    SELECT 1 FROM puzzle_offer_messages
    WHERE offer_id = p_offer_id AND sender_id = v_puzzle.leader_id
      AND content LIKE '__CONTACT__:%' AND is_deleted = false
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '열람할 연락처가 없어요');
  END IF;

  v_cost := puzzle_match_credit_cost(v_puzzle.id);
  SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;
  IF COALESCE(v_md.md_credits, 0) < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', '크레딧이 부족합니다 (' || v_cost || ' 필요)');
  END IF;
  UPDATE users SET md_credits = md_credits - v_cost WHERE id = v_offer.md_id;
  UPDATE puzzle_offers SET md_contact_unlocked_at = now() WHERE id = p_offer_id;

  RETURN jsonb_build_object('success', true, 'charged', true, 'cost', v_cost);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION unlock_leader_contact(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- send_offer_message: 첫 답장 과금 조건에 "열람으로 이미 과금 안 됨" 추가 (이중과금 방지)
--   (442 본문 그대로 + v_md_msg_count = 0 조건에 md_contact_unlocked_at IS NULL 추가)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION send_offer_message(
  p_offer_id UUID,
  p_content  TEXT,
  p_media    JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_offer            puzzle_offers%ROWTYPE;
  v_puzzle           puzzles%ROWTYPE;
  v_md               users%ROWTYPE;
  v_is_md            BOOLEAN;
  v_is_leader        BOOLEAN;
  v_leader_msg_count INT;
  v_md_msg_count     INT;
  v_leader_first     BOOLEAN;
  v_active_chats     INT;
  v_msg_id           UUID;
  v_cost             INT;
  v_preview          TEXT;
BEGIN
  IF NOT is_offer_chat_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', '채팅이 비활성화되어 있습니다');
  END IF;

  IF COALESCE(btrim(p_content), '') = '' AND COALESCE(jsonb_array_length(p_media), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '내용을 입력해주세요');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;

  v_is_md     := (auth.uid() = v_offer.md_id);
  v_is_leader := (auth.uid() = v_puzzle.leader_id);
  IF NOT (v_is_md OR v_is_leader) THEN
    RETURN jsonb_build_object('success', false, 'error', '대화 참여자가 아닙니다');
  END IF;

  IF v_puzzle.status IN ('expired', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 깃발입니다');
  END IF;

  IF v_offer.status IN ('expired', 'rejected', 'withdrawn') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 대화입니다');
  END IF;

  IF v_is_leader THEN
    SELECT NOT EXISTS(
      SELECT 1 FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_puzzle.leader_id
    ) INTO v_leader_first;

    IF v_leader_first THEN
      SELECT count(DISTINCT m.offer_id) INTO v_active_chats
      FROM puzzle_offer_messages m
      JOIN puzzle_offers o ON o.id = m.offer_id
      WHERE o.puzzle_id = v_puzzle.id
        AND m.sender_id = v_puzzle.leader_id
        AND o.status NOT IN ('rejected', 'expired', 'withdrawn');
      IF v_active_chats >= 3 THEN
        RETURN jsonb_build_object('success', false, 'error',
          '최대 3팀까지만 대화할 수 있어요. 기존 대화를 정리해 주세요');
      END IF;
      UPDATE puzzle_offers SET leader_chat_started_at = now() WHERE id = p_offer_id;
    END IF;
  END IF;

  IF v_is_md AND v_offer.status = 'pending' THEN
    SELECT count(*) INTO v_leader_msg_count FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_puzzle.leader_id;
    IF v_leader_msg_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '방장이 먼저 대화를 시작해야 합니다');
    END IF;

    -- MD 첫 답장이고 아직 열람 과금도 안 됐으면 매치 비용 차감 (이중과금 방지)
    SELECT count(*) INTO v_md_msg_count FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_offer.md_id;
    IF v_md_msg_count = 0 AND v_offer.md_contact_unlocked_at IS NULL THEN
      v_cost := puzzle_match_credit_cost(v_puzzle.id);
      SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;
      IF COALESCE(v_md.md_credits, 0) < v_cost THEN
        RETURN jsonb_build_object('success', false, 'error', '크레딧이 부족합니다 (' || v_cost || ' 필요)');
      END IF;
      UPDATE users SET md_credits = md_credits - v_cost WHERE id = v_offer.md_id;
    END IF;
  END IF;

  INSERT INTO puzzle_offer_messages (offer_id, sender_id, content, media)
  VALUES (p_offer_id, auth.uid(), COALESCE(p_content, ''), COALESCE(p_media, '[]'::jsonb))
  RETURNING id INTO v_msg_id;

  v_preview := CASE
    WHEN p_content LIKE '__CONTACT__:dm:%'      THEN '인스타그램 연락처를 보냈어요'
    WHEN p_content LIKE '__CONTACT__:kakao:%'   THEN '카카오 오픈채팅 링크를 보냈어요'
    WHEN p_content LIKE '__CONTACT__:phone:%'   THEN '전화번호를 보냈어요'
    WHEN p_content LIKE '__CONTACT__:address:%' THEN '클럽 위치를 보냈어요'
    ELSE left(COALESCE(NULLIF(btrim(p_content), ''), '사진을 보냈어요'), 40)
  END;

  IF v_is_leader THEN
    UPDATE puzzle_offers SET leader_read_at = now() WHERE id = p_offer_id;
    PERFORM notify_user_push(
      v_offer.md_id,
      '💬 방장이 메시지를 보냈어요',
      v_preview,
      jsonb_build_object('type', 'offer_chat', 'offer_id', p_offer_id::text),
      '/messages/' || p_offer_id::text,
      'chat'
    );
  ELSE
    UPDATE puzzle_offers SET md_read_at = now() WHERE id = p_offer_id;
    PERFORM notify_user_push(
      v_puzzle.leader_id,
      '💬 MD가 답장했어요',
      v_preview,
      jsonb_build_object('type', 'offer_chat', 'offer_id', p_offer_id::text),
      '/messages/' || p_offer_id::text,
      'chat'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
