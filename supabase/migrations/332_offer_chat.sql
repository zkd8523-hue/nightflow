-- ============================================================================
-- Migration 332: 깃발 오퍼 1:1 직접 채팅 (Offer Direct Chat)
-- 날짜: 2026-06-28
-- 설명:
--   방장 ↔ MD가 오퍼 수락 전부터 인앱 1:1 채팅.
--   - 수익 포인트를 "수락"에서 "MD 첫 답장"으로 이동 (MD 첫 답장 = 15크레딧).
--   - 방장이 먼저 말 건 warm lead만 과금 (cold 차단 → 죽은 리드 방지).
--   - 방장은 한 깃발에서 최대 3팀과만 채팅 (MD 승률 보호).
--   - 읽음 표시(카톡 "1"): puzzle_offers.leader_read_at / md_read_at 포인터.
--   - 연락처(카톡/전화)는 수락 후에만 공개 (현행 게이트 유지, 마스킹 없음).
--
--   ⭐ Kill Switch: app_settings.offer_chat_enabled 한 행으로 즉시 원복.
--      FALSE → send_offer_message 거부, accept_offer는 기존 30크레딧 복귀(Migration 333).
--
--   전부 ADDITIVE (테이블·컬럼·함수 추가만). 원복은 332_rollback.sql 참조.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Kill Switch 플래그 (범용 app_settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  bool_value BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, bool_value)
VALUES ('offer_chat_enabled', TRUE)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone reads settings" ON app_settings;
CREATE POLICY "anyone reads settings" ON app_settings
  FOR SELECT USING (true);
-- 쓰기는 service_role / admin 전용 (대시보드·서버에서만). 일반 정책 미부여 = 클라 쓰기 차단.

CREATE OR REPLACE FUNCTION is_offer_chat_enabled()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (SELECT bool_value FROM app_settings WHERE key = 'offer_chat_enabled'),
    FALSE
  );
$$;

-- ----------------------------------------------------------------------------
-- 2) 메시지 테이블
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS puzzle_offer_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id   UUID NOT NULL REFERENCES puzzle_offers(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL DEFAULT '',
  media      JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_msg_offer
  ON puzzle_offer_messages(offer_id, created_at);

ALTER TABLE puzzle_offer_messages ENABLE ROW LEVEL SECURITY;

-- 참여자(해당 오퍼 md_id 또는 그 퍼즐 leader_id)만 읽기/쓰기
DROP POLICY IF EXISTS "offer participants access messages" ON puzzle_offer_messages;
CREATE POLICY "offer participants access messages" ON puzzle_offer_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM puzzle_offers o
      JOIN puzzles p ON p.id = o.puzzle_id
      WHERE o.id = puzzle_offer_messages.offer_id
        AND (o.md_id = auth.uid() OR p.leader_id = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 3) 읽음 포인터 (카톡 "1")
-- ----------------------------------------------------------------------------
ALTER TABLE puzzle_offers ADD COLUMN IF NOT EXISTS leader_read_at TIMESTAMPTZ;
ALTER TABLE puzzle_offers ADD COLUMN IF NOT EXISTS md_read_at     TIMESTAMPTZ;
-- 종료된 대화 목록에서 숨기기(참여자별). 데이터 보존, 본인 목록에서만 제외.
ALTER TABLE puzzle_offers ADD COLUMN IF NOT EXISTS leader_chat_hidden_at TIMESTAMPTZ;
ALTER TABLE puzzle_offers ADD COLUMN IF NOT EXISTS md_chat_hidden_at     TIMESTAMPTZ;
-- 방장이 그 오퍼에 첫 메시지를 보낸 시각 = 실제 상담 시작. "상담중"·3개 슬롯의 단일 기준.
ALTER TABLE puzzle_offers ADD COLUMN IF NOT EXISTS leader_chat_started_at TIMESTAMPTZ;

-- 백필: 방장이 이미 메시지 보낸 기존 오퍼는 첫 메시지 시각으로 채움 (멱등 — NULL만)
UPDATE puzzle_offers o
SET leader_chat_started_at = sub.first_msg
FROM (
  SELECT m.offer_id, MIN(m.created_at) AS first_msg
  FROM puzzle_offer_messages m
  JOIN puzzle_offers po ON po.id = m.offer_id
  JOIN puzzles p ON p.id = po.puzzle_id
  WHERE m.sender_id = p.leader_id AND m.is_deleted = false
  GROUP BY m.offer_id
) sub
WHERE o.id = sub.offer_id AND o.leader_chat_started_at IS NULL;

-- ----------------------------------------------------------------------------
-- 4) Realtime publication (idempotent)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'puzzle_offer_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE puzzle_offer_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'puzzle_offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE puzzle_offers;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5) send_offer_message(): 전송 + 과금(MD 첫 답장 15크레딧) + 3팀 제한 + 읽음 + 푸시
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
  --   · cold 차단(방장 먼저) + 첫 답장 15크레딧.
  -- 수락 후(accepted)엔 매치가 성사됐으므로 우선순위 없음(MD도 먼저 가능) + 추가 과금 없음
  -- (15크레딧은 수락 시 또는 수락 전 첫 답장에서 이미 1회 차감됨).
  IF v_is_md AND v_offer.status = 'pending' THEN
    SELECT count(*) INTO v_leader_msg_count FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_puzzle.leader_id;
    IF v_leader_msg_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '방장이 먼저 대화를 시작해야 합니다');
    END IF;

    -- MD 첫 답장이면 15크레딧 차감
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
-- 6) mark_offer_read(): 채팅방 열람/포커스 시 내 읽음 포인터 갱신
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_offer_read(p_offer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_offer  puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;

  IF auth.uid() = v_puzzle.leader_id THEN
    UPDATE puzzle_offers SET leader_read_at = now() WHERE id = p_offer_id;
  ELSIF auth.uid() = v_offer.md_id THEN
    UPDATE puzzle_offers SET md_read_at = now() WHERE id = p_offer_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 7) get_offer_chats(): 내가 참여한 대화 목록 (/messages 목록 + 하단 점 단일 소스)
--    메시지가 1건 이상 있는 스레드만. 상대 프로필 + 마지막 메시지 + 내 unread.
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
      -- 내가 숨긴(삭제한) 대화는 제외 (참여자별)
      AND NOT (
        (p.leader_id = auth.uid() AND o.leader_chat_hidden_at IS NOT NULL)
        OR (o.md_id = auth.uid() AND o.md_chat_hidden_at IS NOT NULL)
      )
      AND (
        -- 메시지가 있거나(대화중), 수락되어 매치된 오퍼(메시지 0이어도 방 생성)
        o.status = 'accepted'
        OR EXISTS (
          SELECT 1 FROM puzzle_offer_messages m
          WHERE m.offer_id = o.id AND m.is_deleted = false
        )
      )
  ) t;
$$;

GRANT EXECUTE ON FUNCTION is_offer_chat_enabled() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION send_offer_message(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_offer_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_offer_chats() TO authenticated;
