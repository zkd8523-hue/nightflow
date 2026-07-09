-- ============================================================================
-- Migration 442: 연락처 카드 메시지 — 푸시 알림 미리보기 텍스트 정리
-- 날짜: 2026-07-10
-- 배경: 채팅에 "연락처 첨부"(인스타/카톡/전화 탭 가능 카드) 기능 추가.
--       메시지 content가 "__CONTACT__:{method}:{value}" 형태로 인코딩되는데,
--       send_offer_message()의 푸시 알림 미리보기가 raw content를 그대로 잘라 써서
--       수신자 알림에 "__CONTACT__:dm:handle" 같은 원본 문자열이 노출됨.
-- 변경: 345의 send_offer_message() 본문을 그대로 복제하고,
--       미리보기 계산부만 __CONTACT__ 접두사 감지 시 사람이 읽을 문구로 치환.
--       (로직/과금/제약 변경 없음 — 오직 알림 미리보기 텍스트만 수정)
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
  v_active_chats     INT;
  v_msg_id           UUID;
  v_cost             INT;   -- Migration 345: 구간제 매치 비용
  v_preview          TEXT;  -- Migration 442: 푸시 알림 미리보기 텍스트
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

  -- 푸시 알림 미리보기 텍스트 (Migration 442: 연락처 카드는 사람이 읽을 문구로 치환)
  v_preview := CASE
    WHEN p_content LIKE '__CONTACT__:dm:%'      THEN '인스타그램 연락처를 보냈어요'
    WHEN p_content LIKE '__CONTACT__:kakao:%'   THEN '카카오 오픈채팅 링크를 보냈어요'
    WHEN p_content LIKE '__CONTACT__:phone:%'   THEN '전화번호를 보냈어요'
    WHEN p_content LIKE '__CONTACT__:address:%' THEN '클럽 위치를 보냈어요'
    ELSE left(COALESCE(NULLIF(btrim(p_content), ''), '사진을 보냈어요'), 40)
  END;

  -- 보낸 사람 읽음 갱신 + 상대에게 푸시
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

-- ============================================================================
-- 적용: Supabase 대시보드 SQL Editor에서 1회 실행 (db push 금지).
-- 검증: MD가 연락처 카드 전송 → 방장 알림에 "인스타그램 연락처를 보냈어요" 등 노출 확인.
-- ============================================================================
