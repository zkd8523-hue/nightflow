-- ============================================================================
-- Migration 357: 조각 상담 시작(단체방 초대) 과금
-- 날짜: 2026-07-02
-- 설명:
--   조각은 "상담 시작(MD를 단체방에 초대)"이 유료 지점(깃발의 첫 답장과 대칭).
--   invite_md_to_party에서 매치 크레딧(puzzle_match_credit_cost) 1회 과금.
--   "초대 or 즉시수락(accept_offer)" 중 먼저 오는 쪽에서만 1회 과금하도록
--   puzzle_offers.charged_at 마커로 이중과금 방지.
--   (invite_md_to_party는 355, accept_offer는 345 본문 복제 + 과금/dedup만 추가)
-- ============================================================================

-- 0) 과금 마커
ALTER TABLE puzzle_offers ADD COLUMN IF NOT EXISTS charged_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 1) invite_md_to_party(): 초대 시 매치 크레딧 과금 (355 본문 + 과금)
-- ----------------------------------------------------------------------------
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

  -- 상담 시작(초대) = 유료 지점. 매치 크레딧 1회 과금 ("초대 or 즉시수락" 중 먼저; charged_at dedup)
  -- (잔액<0 허용 = 외상 1매치분, 차단은 submit_offer 단계)
  IF v_offer.charged_at IS NULL THEN
    UPDATE users SET md_credits = md_credits - puzzle_match_credit_cost(p_puzzle_id)
    WHERE id = v_offer.md_id;
    UPDATE puzzle_offers SET charged_at = now() WHERE id = p_offer_id;
  END IF;

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
-- 2) accept_offer(): 즉시수락 과금에 charged_at dedup 추가 (345 본문 복제)
--    조각은 단체방 초대(invite)에 puzzle_offer_messages가 없으므로, charged_at로도
--    "이미 과금됨"을 판정해야 초대→즉시수락 이중과금이 안 남.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer   puzzle_offers%ROWTYPE;
  v_puzzle  puzzles%ROWTYPE;
  v_md      users%ROWTYPE;
  v_chat_on BOOLEAN;
  v_cost    INT;
BEGIN
  v_chat_on := is_offer_chat_enabled();

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id FOR UPDATE;
  SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;
  v_cost := puzzle_match_credit_cost(v_offer.puzzle_id);

  -- 검증
  IF v_puzzle.leader_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 수락할 수 있습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다');
  END IF;
  IF v_puzzle.status NOT IN ('open', 'selecting') THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 마감된 퍼즐입니다');
  END IF;
  IF NOT v_chat_on AND COALESCE(v_md.md_credits, 0) < 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD의 크레딧이 부족합니다');
  END IF;

  UPDATE puzzle_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  UPDATE puzzle_offers
  SET status = 'expired', updated_at = now()
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'pending';

  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = v_offer.puzzle_id
      AND id != p_offer_id
      AND status = 'expired'
  );

  INSERT INTO in_app_notifications (user_id, type, title, message)
  SELECT md_id, 'puzzle_offer_rejected', '제안 미선택', '방장이 다른 제안을 선택했습니다.'
  FROM puzzle_offers
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'expired';

  UPDATE puzzles SET
    status = 'accepted',
    accepted_offer_id = p_offer_id
  WHERE id = v_offer.puzzle_id;

  -- MD 크레딧 차감 — 플래그 분기
  IF v_chat_on THEN
    -- 매치당 1회. "첫 답장(1:1) / 조각 초대 / 즉시수락" 중 먼저 오는 쪽에서만 과금.
    IF v_offer.charged_at IS NOT NULL OR EXISTS (
      SELECT 1 FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_offer.md_id
    ) THEN
      -- 이미 과금됨 → 이중과금 방지, 슬롯만 감소
      UPDATE users SET
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id = v_offer.md_id;
    ELSE
      -- 미과금 → 여기서 구간제 차감 + 마커 기록
      UPDATE users SET
        md_credits = md_credits - v_cost,
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id = v_offer.md_id;
      UPDATE puzzle_offers SET charged_at = now() WHERE id = p_offer_id;
    END IF;
  ELSE
    -- 기존 모델: 수락 시 30크레딧 + 슬롯 감소 (Migration 170 동작, 변경 없음)
    UPDATE users SET
      md_credits = md_credits - 30,
      md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
    WHERE id = v_offer.md_id;
  END IF;

  INSERT INTO in_app_notifications (user_id, type, title, message)
  VALUES (
    v_offer.md_id,
    'puzzle_offer_accepted',
    '제안 수락됨!',
    '방장이 회원님의 제안을 선택했습니다. 방장에게 직접 연락해 예약을 확정하세요.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'kakao_open_chat_url', v_puzzle.kakao_open_chat_url,
    'leader_id', v_puzzle.leader_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
