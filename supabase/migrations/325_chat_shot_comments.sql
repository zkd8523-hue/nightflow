-- Migration 325: 와글 SHOT 댓글 (릴스식 댓글 시트)

ALTER TABLE chat_shots
  ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS chat_shot_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id UUID NOT NULL REFERENCES chat_shots(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 300),
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_shot_comments_shot
  ON chat_shot_comments(shot_id, created_at ASC)
  WHERE is_deleted = FALSE;

ALTER TABLE chat_shot_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read comments" ON chat_shot_comments;
CREATE POLICY "Anyone can read comments"
  ON chat_shot_comments
  FOR SELECT USING (is_deleted = FALSE);

DROP POLICY IF EXISTS "Login users can comment" ON chat_shot_comments;
CREATE POLICY "Login users can comment"
  ON chat_shot_comments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = author_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
  );

DROP POLICY IF EXISTS "Author or admin can delete comments" ON chat_shot_comments;
CREATE POLICY "Author or admin can delete comments"
  ON chat_shot_comments
  FOR DELETE USING (
    auth.uid() = author_id
    OR public.is_admin()
  );

-- is_test 자동 마킹 (Migration 319 패턴)
CREATE OR REPLACE FUNCTION mark_chat_shot_comment_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.is_test := COALESCE(
    (SELECT is_test FROM users WHERE id = NEW.author_id),
    FALSE
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_chat_shot_comment_is_test ON chat_shot_comments;
CREATE TRIGGER trg_mark_chat_shot_comment_is_test
  BEFORE INSERT ON chat_shot_comments
  FOR EACH ROW EXECUTE FUNCTION mark_chat_shot_comment_is_test();

-- comment_count 자동 동기화
CREATE OR REPLACE FUNCTION sync_chat_shot_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_deleted = FALSE THEN
    UPDATE chat_shots SET comment_count = comment_count + 1 WHERE id = NEW.shot_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE THEN
    UPDATE chat_shots SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.shot_id;
  ELSIF TG_OP = 'DELETE' AND OLD.is_deleted = FALSE THEN
    UPDATE chat_shots SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.shot_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_chat_shot_comment_count ON chat_shot_comments;
CREATE TRIGGER trg_sync_chat_shot_comment_count
  AFTER INSERT OR UPDATE OR DELETE ON chat_shot_comments
  FOR EACH ROW EXECUTE FUNCTION sync_chat_shot_comment_count();

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_shot_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_shot_comments;
  END IF;
END $$;

COMMENT ON TABLE chat_shot_comments IS '와글 SHOT 댓글 (릴스식). 9시간 휘발성, SHOT 삭제 시 CASCADE.';
