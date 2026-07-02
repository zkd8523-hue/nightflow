-- ============================================================================
-- Migration 362: 조각 단체채팅 이모지 반응 + 답글(인용)
-- 날짜: 2026-07-02
-- 설명: 와글(chat_messages) 리액션/답글 패턴을 조각 단체방에 이식.
--   - puzzle_party_reactions: 메시지별 이모지 반응 (멤버당 이모지 1개씩)
--   - puzzle_party_messages.reply_to: 인용(답글) 대상 메시지 id
--   - send_party_message(): p_reply_to 인자 추가
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 이모지 반응
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS puzzle_party_reactions (
  message_id UUID NOT NULL REFERENCES puzzle_party_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL CHECK (emoji IN ('❤️', '👍', '🔥', '😂', '😮', '🍻')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_party_react_msg ON puzzle_party_reactions(message_id, emoji);

ALTER TABLE puzzle_party_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "party react read" ON puzzle_party_reactions;
CREATE POLICY "party react read" ON puzzle_party_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM puzzle_party_messages m
      WHERE m.id = message_id AND is_party_participant(m.puzzle_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "party react write" ON puzzle_party_reactions;
CREATE POLICY "party react write" ON puzzle_party_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM puzzle_party_messages m
      WHERE m.id = message_id AND is_party_participant(m.puzzle_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "party react delete" ON puzzle_party_reactions;
CREATE POLICY "party react delete" ON puzzle_party_reactions
  FOR DELETE USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'puzzle_party_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE puzzle_party_reactions;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) 답글(인용) 대상
-- ----------------------------------------------------------------------------
ALTER TABLE puzzle_party_messages
  ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES puzzle_party_messages(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3) send_party_message(): p_reply_to 인자 추가 (Migration 352 본문 기반)
--    기존 3-arg 버전은 드롭(오버로드 모호성 방지) → 프론트는 항상 4-arg 호출
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS send_party_message(UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION send_party_message(
  p_puzzle_id UUID,
  p_content   TEXT,
  p_media     JSONB DEFAULT '[]'::jsonb,
  p_reply_to  UUID DEFAULT NULL
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

  -- 인용 대상이 같은 조각의 메시지가 아니면 무시
  IF p_reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM puzzle_party_messages WHERE id = p_reply_to AND puzzle_id = p_puzzle_id
  ) THEN
    p_reply_to := NULL;
  END IF;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, media, reply_to)
  VALUES (p_puzzle_id, auth.uid(), COALESCE(p_content, ''), COALESCE(p_media, '[]'::jsonb), p_reply_to)
  RETURNING id INTO v_msg_id;

  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, auth.uid(), now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '멤버')
    INTO v_sender_name FROM users u WHERE u.id = auth.uid();

  FOR v_recipient IN
    SELECT participant_id FROM (
      SELECT leader_id AS participant_id FROM puzzles WHERE id = p_puzzle_id
      UNION
      SELECT user_id FROM puzzle_members WHERE puzzle_id = p_puzzle_id
      UNION
      SELECT md_id FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id
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
GRANT EXECUTE ON FUNCTION send_party_message(UUID, TEXT, JSONB, UUID) TO authenticated;

COMMENT ON TABLE puzzle_party_reactions IS '조각 단체채팅 메시지 이모지 반응 (와글 chat_message_reactions 패턴).';
