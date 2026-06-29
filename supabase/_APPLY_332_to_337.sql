-- ============================================================
-- NightFlow 채팅 일괄 적용: Migration 332 ~ 337
-- Supabase 대시보드 SQL Editor에 통째로 붙여넣고 Run
-- ============================================================

-- 합본: Migration 332 → 333 → 334 → 335 → 336 (순서대로, 전부 멱등)


-- ▼▼▼ 332_offer_chat.sql ▼▼▼

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


-- ▼▼▼ 333_accept_offer_free_flagged.sql ▼▼▼

-- ============================================================================
-- Migration 333: accept_offer() 매치당 15크레딧 1회 (플래그 분기)
-- 날짜: 2026-06-28 (수정: 채팅 없는 수락도 과금하도록 보강)
-- 설명:
--   오퍼 채팅 모델: 매치 1건당 MD에게 15크레딧 1회만 과금.
--   "MD 첫 답장 OR 방장 수락" 중 먼저 오는 쪽에서 차감 (이중과금 없음):
--     - 채팅 첫 답장 시 → send_offer_message 에서 15 차감 → 수락은 무료
--     - 채팅 없이 바로 수락 시 → accept_offer 에서 15 차감 (공짜 매치 방지)
--   Kill Switch 연동:
--     - is_offer_chat_enabled() = TRUE  → 위 신규 모델
--     - is_offer_chat_enabled() = FALSE → 기존 모델 (수락 시 30크레딧)
--   플래그를 끄면 이 함수가 자동으로 Migration 170 동작으로 원복된다.
--
--   Migration 170 본문과 동일하되, "6) MD 크레딧 차감" 블록만 플래그 분기로 교체.
-- ============================================================================
CREATE OR REPLACE FUNCTION accept_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer  puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_md     users%ROWTYPE;
  v_chat_on BOOLEAN;
BEGIN
  v_chat_on := is_offer_chat_enabled();

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id FOR UPDATE;
  SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;

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
    -- 신규 모델: 매치당 15크레딧 1회. "첫 답장 또는 수락" 중 먼저 오는 쪽에서 과금.
    IF EXISTS (
      SELECT 1 FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_offer.md_id
    ) THEN
      -- 이미 채팅 첫 답장에서 15 차감됨 → 이중과금 방지, 슬롯만 감소
      UPDATE users SET
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id = v_offer.md_id;
    ELSE
      -- 채팅 없이 바로 수락 → 매치당 과금 보장 위해 여기서 15 차감
      -- (잔액<0 허용 = 외상 1매치분, 차단은 submit_offer 단계에서)
      UPDATE users SET
        md_credits = md_credits - 15,
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id = v_offer.md_id;
    END IF;
  ELSE
    -- 기존 모델: 수락 시 30크레딧 + 슬롯 감소 (Migration 170 동작)
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


-- ▼▼▼ 334_drop_accept_offer_kakao.sql ▼▼▼

-- ============================================================================
-- Migration 334: 깃발 오퍼 수락에서 방장 카카오 오픈챗 등록 제거
-- 날짜: 2026-06-29
-- 설명:
--   인앱 1:1 채팅(Migration 332)이 도입되어, 방장이 수락 시 자기 카카오
--   오픈챗을 등록받던 흐름이 불필요해짐.
--
--   문제: Migration 139의 accept_offer(UUID, TEXT DEFAULT NULL) [2-arg, 카카오 등록]가
--   살아있어, 클라이언트가 2-arg로 호출하면 Migration 333(채팅 과금, 1-arg)이 적용되지 않음.
--   또 1-arg 호출은 (UUID) vs (UUID, TEXT DEFAULT NULL) 모호성으로 충돌함.
--
--   해결: 2-arg 버전을 제거 → 333의 1-arg accept_offer(p_offer_id)만 남김.
--   이후 모든 수락은 1-arg로 호출되어 채팅 과금 로직이 정상 적용된다.
--
--   ※ MD의 연락처(MDContactCard, offer.md.kakao_open_chat_url)는 그대로 유지.
--     제거 대상은 "방장이 등록하는 puzzle.kakao_open_chat_url" 흐름뿐.
-- ============================================================================

DROP FUNCTION IF EXISTS accept_offer(UUID, TEXT);


-- ▼▼▼ 335_hide_my_puzzle.sql ▼▼▼

-- ============================================================================
-- Migration 335: 방장이 "내 깃발" 목록에서 완료/만료 깃발 숨기기
-- 날짜: 2026-06-29
-- 설명:
--   사용자 관점에선 "삭제(복구불가)"지만, 매치/거래 기록 보존을 위해 소프트 숨김.
--   leader_hidden_at 설정 → 방장 본인 목록에서만 제외. MD/거래 데이터엔 영향 없음.
--   진행 중(open/selecting) 깃발은 숨길 수 없음.
-- ============================================================================

ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS leader_hidden_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION hide_my_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 깃발만 삭제할 수 있습니다');
  END IF;
  IF v_puzzle.status IN ('open', 'selecting') THEN
    RETURN jsonb_build_object('success', false, 'error', '진행 중인 깃발은 삭제할 수 없습니다');
  END IF;
  UPDATE puzzles SET leader_hidden_at = now() WHERE id = p_puzzle_id;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION hide_my_puzzle(UUID) TO authenticated;


-- ▼▼▼ 336_hide_offer_chat.sql ▼▼▼

-- ============================================================================
-- Migration 336: 종료된 대화 삭제(숨기기) RPC
-- 날짜: 2026-06-29
-- 설명:
--   종료된 오퍼(expired/rejected/withdrawn) 대화를 본인 목록에서 삭제.
--   참여자별 소프트 숨김(leader_chat_hidden_at / md_chat_hidden_at, Migration 332에서 추가).
--   진행 중/매칭된 대화는 삭제 불가.
--   ※ 컬럼 + get_offer_chats 필터는 332에 있음 → 332 재적용 후 이 336 적용.
-- ============================================================================
CREATE OR REPLACE FUNCTION hide_offer_chat(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer  puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '대화를 찾을 수 없습니다');
  END IF;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;

  -- 종료된 대화만 삭제 가능
  IF v_offer.status NOT IN ('expired', 'rejected', 'withdrawn') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 대화만 삭제할 수 있습니다');
  END IF;

  IF auth.uid() = v_puzzle.leader_id THEN
    UPDATE puzzle_offers SET leader_chat_hidden_at = now() WHERE id = p_offer_id;
  ELSIF auth.uid() = v_offer.md_id THEN
    UPDATE puzzle_offers SET md_chat_hidden_at = now() WHERE id = p_offer_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION hide_offer_chat(UUID) TO authenticated;


-- ============================================================
-- 337: 고객 문의 채팅
-- ============================================================
-- ============================================================================
-- Migration 337: 고객 문의 1:1 채팅 (유저 ↔ admin 운영팀)
-- 유저당 상담방 1개. 유저는 본인 상담방만, admin은 전체 조회/답장.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 테이블
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 상담방 주인(유저)
  sender_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_role    TEXT NOT NULL CHECK (sender_role IN ('user', 'admin')),
  body           TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_thread
  ON support_messages(thread_user_id, created_at);

-- 상담방 메타(읽음 추적 + 마지막 메시지) — admin 인박스 정렬/뱃지용
CREATE TABLE IF NOT EXISTS support_threads (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  user_read_at      TIMESTAMPTZ,
  admin_read_at     TIMESTAMPTZ,
  last_message_at   TIMESTAMPTZ,
  last_message_body TEXT,
  last_sender_role  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2) RLS — 직접 INSERT 금지(전송은 SECURITY DEFINER RPC 경유), SELECT만 허용
-- ----------------------------------------------------------------------------
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_threads  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_msg_select" ON support_messages;
CREATE POLICY "support_msg_select" ON support_messages
  FOR SELECT USING (
    thread_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "support_thread_select" ON support_threads;
CREATE POLICY "support_thread_select" ON support_threads
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------------------
-- 3) 유저: 문의 보내기
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION send_support_message(p_body TEXT)
RETURNS support_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_msg support_messages;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF p_body IS NULL OR char_length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION '메시지를 입력해주세요';
  END IF;

  INSERT INTO support_messages(thread_user_id, sender_id, sender_role, body)
  VALUES (v_uid, v_uid, 'user', trim(p_body))
  RETURNING * INTO v_msg;

  INSERT INTO support_threads(user_id, last_message_at, last_message_body, last_sender_role, user_read_at)
  VALUES (v_uid, v_msg.created_at, v_msg.body, 'user', v_msg.created_at)
  ON CONFLICT (user_id) DO UPDATE
    SET last_message_at   = v_msg.created_at,
        last_message_body = v_msg.body,
        last_sender_role  = 'user',
        user_read_at      = v_msg.created_at;

  RETURN v_msg;
END; $$;

-- ----------------------------------------------------------------------------
-- 4) admin: 답장
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION send_support_reply(p_user_id UUID, p_body TEXT)
RETURNS support_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_msg support_messages;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다';
  END IF;
  IF p_body IS NULL OR char_length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION '메시지를 입력해주세요';
  END IF;

  INSERT INTO support_messages(thread_user_id, sender_id, sender_role, body)
  VALUES (p_user_id, v_uid, 'admin', trim(p_body))
  RETURNING * INTO v_msg;

  INSERT INTO support_threads(user_id, last_message_at, last_message_body, last_sender_role, admin_read_at)
  VALUES (p_user_id, v_msg.created_at, v_msg.body, 'admin', v_msg.created_at)
  ON CONFLICT (user_id) DO UPDATE
    SET last_message_at   = v_msg.created_at,
        last_message_body = v_msg.body,
        last_sender_role  = 'admin',
        admin_read_at     = v_msg.created_at;

  RETURN v_msg;
END; $$;

-- ----------------------------------------------------------------------------
-- 5) 읽음 처리 (admin이면 p_user_id 상담방, 아니면 본인 상담방)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_support_read(p_user_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  IF p_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM users WHERE id = v_uid AND role = 'admin') THEN
    INSERT INTO support_threads(user_id, admin_read_at) VALUES (p_user_id, now())
    ON CONFLICT (user_id) DO UPDATE SET admin_read_at = now();
  ELSE
    INSERT INTO support_threads(user_id, user_read_at) VALUES (v_uid, now())
    ON CONFLICT (user_id) DO UPDATE SET user_read_at = now();
  END IF;
END; $$;

-- ----------------------------------------------------------------------------
-- 6) admin 인박스: 상담방 목록 + 미읽음 여부
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_support_threads()
RETURNS TABLE (
  user_id           UUID,
  user_name         TEXT,
  profile_image     TEXT,
  last_message_at   TIMESTAMPTZ,
  last_message_body TEXT,
  last_sender_role  TEXT,
  unread            BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다';
  END IF;

  RETURN QUERY
  SELECT t.user_id,
         COALESCE(u.display_name, u.name, '유저'),
         u.profile_image,
         t.last_message_at,
         t.last_message_body,
         t.last_sender_role,
         (t.last_sender_role = 'user'
          AND (t.admin_read_at IS NULL OR t.last_message_at > t.admin_read_at)) AS unread
  FROM support_threads t
  JOIN users u ON u.id = t.user_id
  ORDER BY t.last_message_at DESC NULLS LAST;
END; $$;

GRANT EXECUTE ON FUNCTION send_support_message(TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION send_support_reply(UUID, TEXT)    TO authenticated;
GRANT EXECUTE ON FUNCTION mark_support_read(UUID)           TO authenticated;
GRANT EXECUTE ON FUNCTION get_support_threads()             TO authenticated;

-- ----------------------------------------------------------------------------
-- 7) Realtime
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;
  END IF;
END $$;
