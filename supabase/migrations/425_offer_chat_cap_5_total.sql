-- ============================================================================
-- Migration 425: 깃발 오퍼 채팅 슬롯 캡 재설계 — 동시 3팀 → 총 5팀(종료 포함)
-- 날짜: 2026-07-08
-- 설명:
--   기존: 방장이 동시에 열 수 있는 채팅 3팀. "상담 종료(reject)" 시 슬롯 회복 → swap 가능.
--   변경: 한 깃발에서 방장이 대화한 MD는 종료 여부와 무관하게 총 5팀까지.
--         → 종료(rejected/expired/withdrawn)한 대화도 카운트에 포함 = swap 없음.
--   근거:
--     - "정리하면 또 대화 가능"은 실질 5팀 상한을 넘는 것처럼 오인시키는 문구(눈속임).
--     - 종료 포함 총 5팀 캡은 깃발당 MD pay-to-lose 노출(15크레딧×N)을 확실히 묶음.
--     - 앵커 3(기본)은 클라 UX 확인이 담당, 서버는 하드캡 5만 강제.
--   send_offer_message() 본문은 Migration 361과 동일, 방장 슬롯 제한 블록만 교체.
-- ============================================================================

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
  v_chatted_teams    INT;
  v_msg_id           UUID;
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

  -- 조각은 단체채팅으로 통합 → 1:1 오퍼 채팅 차단
  IF v_puzzle.is_recruiting_party THEN
    RETURN jsonb_build_object('success', false, 'error', '조각은 단체채팅을 이용해주세요');
  END IF;

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

  -- 방장이 새 MD에게 첫 메시지: 한 깃발에서 대화한 MD는 총 5팀까지 (종료 포함, swap 없음)
  IF v_is_leader THEN
    SELECT NOT EXISTS(
      SELECT 1 FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_puzzle.leader_id
    ) INTO v_leader_first;

    IF v_leader_first THEN
      -- 상태 무관: 방장이 메시지를 보낸 적 있는 모든 오퍼(=대화한 팀) 카운트
      SELECT count(DISTINCT m.offer_id) INTO v_chatted_teams
      FROM puzzle_offer_messages m
      JOIN puzzle_offers o ON o.id = m.offer_id
      WHERE o.puzzle_id = v_puzzle.id
        AND m.sender_id = v_puzzle.leader_id;
      IF v_chatted_teams >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error',
          '한 깃발에서는 최대 5팀과 대화할 수 있어요');
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

    SELECT count(*) INTO v_md_msg_count FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_offer.md_id;
    IF v_md_msg_count = 0 THEN
      SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;
      IF COALESCE(v_md.md_credits, 0) < 15 THEN
        RETURN jsonb_build_object('success', false, 'error', '크레딧이 부족합니다 (15 필요)');
      END IF;
      UPDATE users SET md_credits = md_credits - 15 WHERE id = v_offer.md_id;
    END IF;
  END IF;

  INSERT INTO puzzle_offer_messages (offer_id, sender_id, content, media)
  VALUES (p_offer_id, auth.uid(), COALESCE(p_content, ''), COALESCE(p_media, '[]'::jsonb))
  RETURNING id INTO v_msg_id;

  IF v_is_leader THEN
    UPDATE puzzle_offers SET leader_read_at = now() WHERE id = p_offer_id;
    PERFORM notify_user_push(
      v_offer.md_id,
      '💬 방장이 메시지를 보냈어요',
      left(COALESCE(NULLIF(btrim(p_content), ''), '사진을 보냈어요'), 40),
      jsonb_build_object('type', 'offer_chat', 'offer_id', p_offer_id::text),
      '/messages/' || p_offer_id::text,
      'chat'
    );
  ELSE
    UPDATE puzzle_offers SET md_read_at = now() WHERE id = p_offer_id;
    PERFORM notify_user_push(
      v_puzzle.leader_id,
      '💬 MD가 답장했어요',
      left(COALESCE(NULLIF(btrim(p_content), ''), '사진을 보냈어요'), 40),
      jsonb_build_object('type', 'offer_chat', 'offer_id', p_offer_id::text),
      '/messages/' || p_offer_id::text,
      'chat'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
