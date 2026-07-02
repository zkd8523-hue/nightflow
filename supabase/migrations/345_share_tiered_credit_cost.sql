-- ============================================================================
-- Migration 345: 조각(파티원 모집) 매치 크레딧 예산 구간제
-- 날짜: 2026-07-01
-- 설명:
--   조각(is_recruiting_party=true)의 매치 크레딧을 예산 구간별로 차등:
--     · 총예산 ≤ 50만원 → 8 크레딧
--     · 총예산 > 50만원 → 15 크레딧
--   깃발(is_recruiting_party=false)은 기존대로 15 크레딧.
--   레거시 채팅OFF 경로(수락 시 30크레딧)는 변경하지 않음.
--
--   구현: send_offer_message(332) / accept_offer(333) 본문을 그대로 복제하고,
--   하드코딩 15만 puzzle_match_credit_cost() 헬퍼 호출로 교체.
-- ============================================================================

-- 1) 매치 크레딧 비용 헬퍼 (조각만 구간제, 그 외 15)
--    조각 예산은 조각원 수에 비례하므로, 차감이 일어나는 "그 순간"의
--    현재 인원 기준 예산(current_count 비례)으로 구간을 판정한다.
--    (OfferSheet의 현재 오퍼 금액 계산식과 동일한 비례 규칙)
CREATE OR REPLACE FUNCTION puzzle_match_credit_cost(p_puzzle_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN NOT p.is_recruiting_party THEN 15
    WHEN (
      CASE
        WHEN p.current_count >= p.target_count
          THEN COALESCE(p.total_budget, p.budget_per_person * p.target_count)
        ELSE ROUND(
          COALESCE(p.total_budget, p.budget_per_person * p.target_count)::NUMERIC
          * p.current_count / NULLIF(p.target_count, 0)
        )
      END
    ) <= 500000 THEN 8
    ELSE 15
  END
  FROM puzzles p WHERE p.id = p_puzzle_id;
$$;

-- ----------------------------------------------------------------------------
-- 2) send_offer_message(): MD 첫 답장 과금을 구간제로 (332 본문 복제 + 비용 교체)
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
  v_cost             INT;   -- Migration 345: 구간제 매치 비용
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

  -- 종료된 깃발은 읽기 전용
  IF v_puzzle.status IN ('expired', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 깃발입니다');
  END IF;

  -- 종료된 오퍼(다른 MD가 매칭됨/거절/철회)는 더 이상 전송 불가
  IF v_offer.status IN ('expired', 'rejected', 'withdrawn') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 대화입니다');
  END IF;

  -- 방장이 새 MD에게 첫 메시지: 활성 채팅 3팀 제한
  IF v_is_leader THEN
    SELECT NOT EXISTS(
      SELECT 1 FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_puzzle.leader_id
    ) INTO v_leader_first;

    IF v_leader_first THEN
      -- 이 깃발에서 방장이 말 건(=채팅 시작), 닫지 않은 오퍼 수
      SELECT count(DISTINCT m.offer_id) INTO v_active_chats
      FROM puzzle_offer_messages m
      JOIN puzzle_offers o ON o.id = m.offer_id
      WHERE o.puzzle_id = v_puzzle.id
        AND m.sender_id = v_puzzle.leader_id
        AND o.status NOT IN ('rejected', 'expired', 'withdrawn'); -- 닫힌 건 슬롯 회복
      IF v_active_chats >= 3 THEN
        RETURN jsonb_build_object('success', false, 'error',
          '최대 3팀까지만 대화할 수 있어요. 기존 대화를 정리해 주세요');
      END IF;
      -- 방장 첫 메시지 = 상담 시작 마킹 ("상담중"·슬롯 단일 기준)
      UPDATE puzzle_offers SET leader_chat_started_at = now() WHERE id = p_offer_id;
    END IF;
  END IF;

  -- MD 제약은 수락 전(pending)에만 적용:
  --   · cold 차단(방장 먼저) + 첫 답장 과금(구간제).
  IF v_is_md AND v_offer.status = 'pending' THEN
    SELECT count(*) INTO v_leader_msg_count FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_puzzle.leader_id;
    IF v_leader_msg_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '방장이 먼저 대화를 시작해야 합니다');
    END IF;

    -- MD 첫 답장이면 매치 비용(구간제) 차감
    SELECT count(*) INTO v_md_msg_count FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_offer.md_id;
    IF v_md_msg_count = 0 THEN
      v_cost := puzzle_match_credit_cost(v_puzzle.id);
      SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;
      IF COALESCE(v_md.md_credits, 0) < v_cost THEN
        RETURN jsonb_build_object('success', false, 'error', '크레딧이 부족합니다 (' || v_cost || ' 필요)');
      END IF;
      UPDATE users SET md_credits = md_credits - v_cost WHERE id = v_offer.md_id;
    END IF;
  END IF;

  -- 메시지 저장
  INSERT INTO puzzle_offer_messages (offer_id, sender_id, content, media)
  VALUES (p_offer_id, auth.uid(), COALESCE(p_content, ''), COALESCE(p_media, '[]'::jsonb))
  RETURNING id INTO v_msg_id;

  -- 보낸 사람 읽음 갱신 + 상대에게 푸시
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

-- ----------------------------------------------------------------------------
-- 3) accept_offer(): 채팅없는 즉시수락 과금을 구간제로 (333 본문 복제 + 비용 교체)
--    레거시 채팅OFF 경로(30크레딧)는 변경 없음.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer   puzzle_offers%ROWTYPE;
  v_puzzle  puzzles%ROWTYPE;
  v_md      users%ROWTYPE;
  v_chat_on BOOLEAN;
  v_cost    INT;   -- Migration 345: 구간제 매치 비용
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
  -- 기존 모델(플래그 OFF)일 때만 수락 시 크레딧 검증
  IF NOT v_chat_on AND COALESCE(v_md.md_credits, 0) < 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD의 크레딧이 부족합니다');
  END IF;

  -- 오퍼 수락
  UPDATE puzzle_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  -- 나머지 pending 오퍼 expired 처리
  UPDATE puzzle_offers
  SET status = 'expired', updated_at = now()
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'pending';

  -- 탈락 MD들 슬롯 회복
  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = v_offer.puzzle_id
      AND id != p_offer_id
      AND status = 'expired'
  );

  -- 탈락 MD들에게 알림
  INSERT INTO in_app_notifications (user_id, type, title, message)
  SELECT md_id, 'puzzle_offer_rejected', '제안 미선택', '방장이 다른 제안을 선택했습니다.'
  FROM puzzle_offers
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'expired';

  -- 퍼즐 상태 변경
  UPDATE puzzles SET
    status = 'accepted',
    accepted_offer_id = p_offer_id
  WHERE id = v_offer.puzzle_id;

  -- MD 크레딧 차감 — 플래그 분기
  IF v_chat_on THEN
    -- 신규 모델: 매치당 구간제 1회. "첫 답장 또는 수락" 중 먼저 오는 쪽에서 과금.
    IF EXISTS (
      SELECT 1 FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_offer.md_id
    ) THEN
      -- 이미 채팅 첫 답장에서 차감됨 → 이중과금 방지, 슬롯만 감소
      UPDATE users SET
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id = v_offer.md_id;
    ELSE
      -- 채팅 없이 바로 수락 → 매치당 과금 보장 위해 여기서 구간제 차감
      -- (잔액<0 허용 = 외상 1매치분, 차단은 submit_offer 단계에서)
      UPDATE users SET
        md_credits = md_credits - v_cost,
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id = v_offer.md_id;
    END IF;
  ELSE
    -- 기존 모델: 수락 시 30크레딧 + 슬롯 감소 (Migration 170 동작, 변경 없음)
    UPDATE users SET
      md_credits = md_credits - 30,
      md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
    WHERE id = v_offer.md_id;
  END IF;

  -- 수락된 MD에게 알림
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
