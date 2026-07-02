-- ============================================================================
-- Migration 361: 조각(파티) 1:1 오퍼 채팅 완전 차단 → 단체채팅으로 통합
-- 날짜: 2026-07-02
-- 설명:
--   조각(is_recruiting_party=true)은 MD 상담을 단체채팅(puzzle_party_messages)으로 통합.
--   1:1 오퍼 채팅(puzzle_offer_messages)은 깃발(비모집) 전용으로 제한.
--   - send_offer_message(): 조각 오퍼면 거부
--   - get_offer_chats(): 조각 오퍼 채팅 목록에서 제외
--   레거시 데이터는 보존(접근만 차단). 라우트는 앱에서 /party로 리다이렉트.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- send_offer_message(): 조각 거부 가드 추가 (Migration 332 본문 + 가드)
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

  -- 방장이 새 MD에게 첫 메시지: 활성 채팅 3팀 제한
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

-- ----------------------------------------------------------------------------
-- get_offer_chats(): 조각(파티) 오퍼 채팅 제외 (Migration 332 본문 + 필터)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_offer_chats()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.last_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      o.id                AS offer_id,
      o.puzzle_id         AS puzzle_id,
      o.status            AS offer_status,
      p.area              AS area,
      p.event_date        AS event_date,
      COALESCE(p.total_budget, p.budget_per_person * p.target_count) AS budget,
      p.is_recruiting_party AS is_recruiting_party,  -- Migration 346 유지
      CASE WHEN p.leader_id = auth.uid() THEN 'leader' ELSE 'md' END AS my_role,
      cp.id               AS counterpart_id,
      cp.display_name     AS counterpart_name,
      cp.profile_image    AS counterpart_image,
      COALESCE(lm.content, '매칭됐어요 · 대화를 시작해보세요') AS last_content,
      COALESCE(lm.created_at, o.updated_at) AS last_at,
      lm.sender_id        AS last_sender_id,
      EXISTS (
        SELECT 1 FROM puzzle_offer_messages m2
        WHERE m2.offer_id = o.id
          AND m2.is_deleted = false
          AND m2.sender_id <> auth.uid()
          AND m2.created_at > COALESCE(
                CASE WHEN p.leader_id = auth.uid() THEN o.leader_read_at ELSE o.md_read_at END,
                'epoch'::timestamptz)
      ) AS unread
    FROM puzzle_offers o
    JOIN puzzles p ON p.id = o.puzzle_id
    JOIN public_user_profiles cp
      ON cp.id = CASE WHEN p.leader_id = auth.uid() THEN o.md_id ELSE p.leader_id END
    LEFT JOIN LATERAL (
      SELECT content, created_at, sender_id
      FROM puzzle_offer_messages
      WHERE offer_id = o.id AND is_deleted = false
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    WHERE (p.leader_id = auth.uid() OR o.md_id = auth.uid())
      AND p.is_recruiting_party = false   -- 조각은 단체채팅으로 통합 → 1:1 목록 제외
      AND NOT (
        (p.leader_id = auth.uid() AND o.leader_chat_hidden_at IS NOT NULL)
        OR (o.md_id = auth.uid() AND o.md_chat_hidden_at IS NOT NULL)
      )
      AND (
        o.status = 'accepted'
        OR EXISTS (
          SELECT 1 FROM puzzle_offer_messages m
          WHERE m.offer_id = o.id AND m.is_deleted = false
        )
      )
  ) t;
$$;
