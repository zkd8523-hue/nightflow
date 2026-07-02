-- ============================================================================
-- Migration 349: 조각(파티) 단체 채팅 (Party Group Chat)
-- 날짜: 2026-07-02
-- 설명:
--   조각(is_recruiting_party=true)의 방장 + 합류 유저들이 함께하는 인앱 단체채팅.
--   - 카카오 오픈채팅 대체 (조각은 이제 인앱 단체방으로 모임).
--   - 오퍼 1:1 채팅(puzzle_offer_messages, 방장↔MD)과는 별개 축.
--   - 합류 즉시 단체방에 시스템 메시지("OOO님이 합류했어요")로 자동 합류.
--   - 읽음: 멤버별 puzzle_party_reads.last_read_at 포인터 (나의 채팅 unread 점).
--   전부 ADDITIVE (테이블/함수 추가 + join_puzzle 재정의).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 참여자 판별 헬퍼: 방장 또는 합류 멤버
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_party_participant(p_puzzle_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id
  );
$$;
GRANT EXECUTE ON FUNCTION is_party_participant(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) 메시지 테이블
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS puzzle_party_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id  UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  sender_id  UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = 시스템 메시지
  content    TEXT NOT NULL DEFAULT '',
  media      JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system  BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_party_msg_puzzle
  ON puzzle_party_messages(puzzle_id, created_at);

ALTER TABLE puzzle_party_messages ENABLE ROW LEVEL SECURITY;

-- 참여자(방장+멤버)만 읽기
DROP POLICY IF EXISTS "party participants read messages" ON puzzle_party_messages;
CREATE POLICY "party participants read messages" ON puzzle_party_messages
  FOR SELECT USING (is_party_participant(puzzle_id, auth.uid()));

-- 직접 INSERT는 참여자 + 본인 발신만 (시스템 메시지는 SECURITY DEFINER RPC로만)
DROP POLICY IF EXISTS "party participants insert messages" ON puzzle_party_messages;
CREATE POLICY "party participants insert messages" ON puzzle_party_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND is_party_participant(puzzle_id, auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 3) 읽음 포인터 (멤버별)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS puzzle_party_reads (
  puzzle_id    UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (puzzle_id, user_id)
);
ALTER TABLE puzzle_party_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own party reads" ON puzzle_party_reads;
CREATE POLICY "own party reads" ON puzzle_party_reads
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4) Realtime publication (idempotent)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'puzzle_party_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE puzzle_party_messages;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5) send_party_message(): 전송 + 보낸이 읽음 + 다른 참여자 전원 푸시
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION send_party_message(
  p_puzzle_id UUID,
  p_content   TEXT,
  p_media     JSONB DEFAULT '[]'::jsonb
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
  IF NOT is_party_participant(p_puzzle_id, auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;
  IF v_puzzle.status IN ('expired', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 조각입니다');
  END IF;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, media)
  VALUES (p_puzzle_id, auth.uid(), COALESCE(p_content, ''), COALESCE(p_media, '[]'::jsonb))
  RETURNING id INTO v_msg_id;

  -- 보낸 사람 읽음 갱신
  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, auth.uid(), now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '멤버')
    INTO v_sender_name FROM users u WHERE u.id = auth.uid();

  -- 다른 참여자 전원(방장+멤버)에게 푸시
  FOR v_recipient IN
    SELECT participant_id FROM (
      SELECT leader_id AS participant_id FROM puzzles WHERE id = p_puzzle_id
      UNION
      SELECT user_id FROM puzzle_members WHERE puzzle_id = p_puzzle_id
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
GRANT EXECUTE ON FUNCTION send_party_message(UUID, TEXT, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) mark_party_read(): 방 열람/포커스 시 내 읽음 포인터 갱신
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_party_read(p_puzzle_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT is_party_participant(p_puzzle_id, auth.uid()) THEN RETURN; END IF;
  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, auth.uid(), now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION mark_party_read(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7) get_party_chats(): 내가 참여한 조각 단체방 목록 (나의 채팅 조각 탭)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_party_chats()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.last_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      p.id                AS puzzle_id,
      p.area              AS area,
      p.event_date        AS event_date,
      COALESCE(p.total_budget, p.budget_per_person * p.target_count) AS budget,
      p.current_count     AS member_count,
      (p.leader_id = auth.uid()) AS is_leader,
      p.status            AS puzzle_status,
      COALESCE(lm.content, '단체채팅이 열렸어요') AS last_content,
      COALESCE(lm.created_at, p.created_at) AS last_at,
      lm.sender_id        AS last_sender_id,
      EXISTS (
        SELECT 1 FROM puzzle_party_messages m2
        WHERE m2.puzzle_id = p.id
          AND m2.is_deleted = false
          AND m2.sender_id IS DISTINCT FROM auth.uid()
          AND m2.created_at > COALESCE(
            (SELECT r.last_read_at FROM puzzle_party_reads r
              WHERE r.puzzle_id = p.id AND r.user_id = auth.uid()),
            'epoch'::timestamptz)
      ) AS unread
    FROM puzzles p
    LEFT JOIN LATERAL (
      SELECT content, created_at, sender_id
      FROM puzzle_party_messages
      WHERE puzzle_id = p.id AND is_deleted = false
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    WHERE p.is_recruiting_party = true
      AND is_party_participant(p.id, auth.uid())
  ) t;
$$;
GRANT EXECUTE ON FUNCTION get_party_chats() TO authenticated;

-- ----------------------------------------------------------------------------
-- 8) join_puzzle(): 합류 시 단체채팅 시스템 메시지 + 합류자 읽음 초기화
--    (Migration 157 본문 그대로 + 단체채팅 합류 배관 추가)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_puzzle(p_puzzle_id UUID, p_guest_count INTEGER DEFAULT 0)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_total INTEGER;
  v_u users%ROWTYPE;
  v_user_name TEXT;
BEGIN
  v_total := 1 + GREATEST(p_guest_count, 0);
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  SELECT * INTO v_u FROM users WHERE id = auth.uid();

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '퍼즐을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 퍼즐입니다');
  END IF;
  IF v_puzzle.current_count + v_total > v_puzzle.target_count THEN
    RETURN jsonb_build_object('success', false, 'error', '남은 자리가 부족합니다');
  END IF;
  IF v_puzzle.leader_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인이 만든 퍼즐입니다');
  END IF;
  IF EXISTS (SELECT 1 FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 참여한 퍼즐입니다');
  END IF;

  INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
    VALUES (p_puzzle_id, auth.uid(), GREATEST(p_guest_count, 0));
  UPDATE puzzles SET current_count = current_count + v_total WHERE id = p_puzzle_id;

  -- 이름 폴백: name → display_name → '회원'
  v_user_name := COALESCE(NULLIF(v_u.name, ''), NULLIF(v_u.display_name, ''), '회원');

  -- 단체채팅 시스템 메시지 + 합류자 본인 읽음 초기화
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL, v_user_name || '님이 합류했어요', TRUE);
  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
    VALUES (p_puzzle_id, auth.uid(), now())
    ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  -- 방장에게 알림 발송
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_member_joined',
    '새로운 참여자!',
    v_user_name || '님이 퍼즐에 참여했습니다. 인원을 확인해보세요!',
    '/puzzles/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true, 'current_count', v_puzzle.current_count + v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE puzzle_party_messages IS
  '조각(is_recruiting_party) 단체채팅 메시지. 방장+합류 멤버. sender_id NULL=시스템 메시지.';
COMMENT ON TABLE puzzle_party_reads IS
  '조각 단체채팅 멤버별 읽음 포인터 (나의 채팅 unread 점 계산).';
