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
