-- Migration 291: 와글 답글 + 이모지 반응
-- - chat_messages.parent_id, reply_count
-- - chat_message_reactions (이모지 반응)
-- - 답글 알림 (in_app_notifications, type='chat_reply')

-- ============================================
-- 1) 답글 컬럼 추가
-- ============================================
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE;
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_chat_messages_parent
  ON chat_messages(parent_id, created_at ASC)
  WHERE parent_id IS NOT NULL AND is_deleted = FALSE;

COMMENT ON COLUMN chat_messages.parent_id IS
  '답글의 부모 메시지 ID. NULL이면 최상위 와글. 1-depth 답글만 허용 (parent의 parent_id는 NULL이어야 함, 클라/UI 강제).';

-- ============================================
-- 2) 이모지 반응 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS chat_message_reactions (
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL
    CHECK (emoji IN ('❤️', '👍', '🔥', '😂', '😮', '🍻')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
  ON chat_message_reactions(message_id, emoji);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_user
  ON chat_message_reactions(user_id);

ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read reactions" ON chat_message_reactions;
CREATE POLICY "Anyone can read reactions"
  ON chat_message_reactions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Login users can react" ON chat_message_reactions;
CREATE POLICY "Login users can react"
  ON chat_message_reactions
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
  );

DROP POLICY IF EXISTS "User can cancel own reaction" ON chat_message_reactions;
CREATE POLICY "User can cancel own reaction"
  ON chat_message_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_message_reactions;
  END IF;
END $$;

-- ============================================
-- 3) 답글 추가/삭제 시 parent.reply_count 동기화
-- ============================================
CREATE OR REPLACE FUNCTION sync_chat_reply_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- INSERT: 답글 추가 시 parent reply_count +1
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE chat_messages
      SET reply_count = reply_count + 1
      WHERE id = NEW.parent_id;
    RETURN NEW;
  -- DELETE: hard delete 시 parent reply_count -1
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE chat_messages
      SET reply_count = GREATEST(reply_count - 1, 0)
      WHERE id = OLD.parent_id;
    RETURN OLD;
  -- UPDATE (soft delete): is_deleted=true 전환 시 -1
  ELSIF TG_OP = 'UPDATE' AND NEW.parent_id IS NOT NULL THEN
    IF OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE THEN
      UPDATE chat_messages
        SET reply_count = GREATEST(reply_count - 1, 0)
        WHERE id = NEW.parent_id;
    ELSIF OLD.is_deleted = TRUE AND NEW.is_deleted = FALSE THEN
      UPDATE chat_messages
        SET reply_count = reply_count + 1
        WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_chat_reply_count ON chat_messages;
CREATE TRIGGER trg_sync_chat_reply_count
  AFTER INSERT OR UPDATE OR DELETE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION sync_chat_reply_count();

-- ============================================
-- 4) 답글 작성 시 부모 작성자에게 인앱 알림
-- ============================================
CREATE OR REPLACE FUNCTION notify_chat_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_author UUID;
  v_replier_name TEXT;
  v_room TEXT;
  v_preview TEXT;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 부모 메시지 작성자, 방
  SELECT author_id, room INTO v_parent_author, v_room
    FROM chat_messages
    WHERE id = NEW.parent_id;

  -- 본인 글에 본인 답글 → 알림 X
  IF v_parent_author IS NULL OR v_parent_author = NEW.author_id THEN
    RETURN NEW;
  END IF;

  -- 답글 작성자 닉네임
  SELECT display_name INTO v_replier_name
    FROM users
    WHERE id = NEW.author_id;

  v_preview := substring(COALESCE(NEW.content, ''), 1, 30);
  IF char_length(COALESCE(NEW.content, '')) > 30 THEN
    v_preview := v_preview || '...';
  END IF;

  INSERT INTO in_app_notifications (
    user_id, type, title, message, action_url
  ) VALUES (
    v_parent_author,
    'chat_reply',
    '내 와글에 답글이 달렸어요',
    COALESCE(v_replier_name, '익명') || ': ' || COALESCE(v_preview, ''),
    '/chat?reply=' || NEW.parent_id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_chat_reply ON chat_messages;
CREATE TRIGGER trg_notify_chat_reply
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION notify_chat_reply();

-- ============================================
-- 5) 코멘트
-- ============================================
COMMENT ON TABLE chat_message_reactions IS
  '와글 이모지 반응 (❤️ 👍 🔥 😂 😮 🍻). 같은 유저가 한 메시지에 여러 이모지 가능.';
COMMENT ON FUNCTION notify_chat_reply() IS
  '답글 작성 시 부모 메시지 작성자에게 in_app_notifications 알림 생성. 본인 답글은 알림 X.';
