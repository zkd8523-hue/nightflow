-- Migration 316: 와글 SHOT 좋아요 (옵션 A: 단순 ❤️ 토글)
-- - 인스타 스토리 패턴: 하트 하나만, 카운트 캐시
-- - 본인 SHOT엔 좋아요 불가
-- - 9시간 휘발이라 누적 부담 거의 없음

-- ============================================
-- 1) like_count 캐시 컬럼
-- ============================================
ALTER TABLE chat_shots
  ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;

-- ============================================
-- 2) 좋아요 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS chat_shot_likes (
  shot_id UUID NOT NULL REFERENCES chat_shots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shot_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_shot_likes_user
  ON chat_shot_likes(user_id);

ALTER TABLE chat_shot_likes ENABLE ROW LEVEL SECURITY;

-- 누구나 좋아요 수 읽기 (집계 캐시는 like_count에 있지만 liked_by_me 계산용)
DROP POLICY IF EXISTS "Anyone can read shot likes" ON chat_shot_likes;
CREATE POLICY "Anyone can read shot likes"
  ON chat_shot_likes
  FOR SELECT USING (true);

-- 본인 SHOT엔 좋아요 불가, 차단/탈퇴 유저도 불가
DROP POLICY IF EXISTS "Like others shots only" ON chat_shot_likes;
CREATE POLICY "Like others shots only"
  ON chat_shot_likes
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM chat_shots
      WHERE id = shot_id AND author_id = auth.uid()
    )
  );

-- 본인 좋아요 취소만 가능
DROP POLICY IF EXISTS "Cancel own shot like" ON chat_shot_likes;
CREATE POLICY "Cancel own shot like"
  ON chat_shot_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 3) like_count 자동 동기화 트리거
-- ============================================
CREATE OR REPLACE FUNCTION sync_chat_shot_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE chat_shots
      SET like_count = like_count + 1
      WHERE id = NEW.shot_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE chat_shots
      SET like_count = GREATEST(like_count - 1, 0)
      WHERE id = OLD.shot_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_chat_shot_like_count ON chat_shot_likes;
CREATE TRIGGER trg_sync_chat_shot_like_count
  AFTER INSERT OR DELETE ON chat_shot_likes
  FOR EACH ROW EXECUTE FUNCTION sync_chat_shot_like_count();

-- ============================================
-- 4) Realtime — like_count 즉시 반영
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_shot_likes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_shot_likes;
  END IF;
END $$;

COMMENT ON TABLE chat_shot_likes IS
  '와글 SHOT 좋아요 (옵션 A 인스타 스토리식). 본인 SHOT 불가, 토글식.';
