-- ============================================================================
-- Migration 602: 공연 댓글 대댓글 + 좋아요, 공연 채팅방 제거
-- 날짜: 2026-08-28
-- 설명:
--   598이 만든 2층 구조(댓글 + "같이 갈 사람" 채팅방)에서 채팅방을 걷어내고,
--   댓글 자체를 대댓글·좋아요가 되는 자족적인 공간으로 만든다.
--
--   왜 채팅방을 없애나
--     공연 하나당 방이 여러 개 생기는데 각 방에 사람이 안 모인다(파편화).
--     댓글에서 바로 답글이 오가면 대화가 한 줄기로 모인다.
--
--   ⚠️ event_chat_rooms는 DROP하지 않는다.
--      기존 방의 대화(chat_messages)는 room 키로만 이어져 있어, 테이블을 지우면
--      그 방들이 고아가 된다. 새 방 생성만 막고(RLS), UI에서 뺀다.
--      데이터가 완전히 식은 뒤 별도 마이그레이션에서 정리한다.
--
--   대댓글은 291(와글 답글)의 parent_id + reply_count 패턴을 그대로 쓴다.
--   좋아요는 597(event_likes) 구조를 그대로 쓴다.
-- ============================================================================

-- ============================================================================
-- 1) 대댓글 — 1-depth만 (답글의 답글 금지)
-- ============================================================================

ALTER TABLE event_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES event_comments(id) ON DELETE CASCADE;

ALTER TABLE event_comments
  ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_event_comments_parent
  ON event_comments(parent_id, created_at ASC)
  WHERE parent_id IS NOT NULL AND is_deleted = FALSE;

COMMENT ON COLUMN event_comments.parent_id IS
  '답글의 부모 댓글 ID. NULL이면 최상위 댓글. 1-depth만 허용(아래 트리거가 강제).';

-- 답글의 답글 차단 — UI만으로 막으면 API 직접 호출로 뚫린다
CREATE OR REPLACE FUNCTION check_event_comment_depth()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM event_comments
      WHERE id = NEW.parent_id AND parent_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION '답글에는 답글을 달 수 없습니다';
    END IF;
    -- 다른 공연의 댓글에 답글을 매다는 것도 막는다
    IF EXISTS (
      SELECT 1 FROM event_comments
      WHERE id = NEW.parent_id AND event_id <> NEW.event_id
    ) THEN
      RAISE EXCEPTION '다른 공연의 댓글에는 답글을 달 수 없습니다';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_check_event_comment_depth ON event_comments;
CREATE TRIGGER trg_check_event_comment_depth
  BEFORE INSERT ON event_comments
  FOR EACH ROW EXECUTE FUNCTION check_event_comment_depth();

-- reply_count 동기화 (291의 sync_chat_reply_count와 같은 모양)
CREATE OR REPLACE FUNCTION sync_event_comment_reply_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE event_comments SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE event_comments SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.parent_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND NEW.parent_id IS NOT NULL THEN
    IF OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE THEN
      UPDATE event_comments SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = NEW.parent_id;
    ELSIF OLD.is_deleted = TRUE AND NEW.is_deleted = FALSE THEN
      UPDATE event_comments SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_sync_event_comment_reply_count ON event_comments;
CREATE TRIGGER trg_sync_event_comment_reply_count
  AFTER INSERT OR UPDATE OF is_deleted OR DELETE ON event_comments
  FOR EACH ROW EXECUTE FUNCTION sync_event_comment_reply_count();

-- ============================================================================
-- 2) 댓글 좋아요 — 597(event_likes) 구조 그대로
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_comment_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES event_comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_test    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_comment_likes_comment
  ON event_comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_event_comment_likes_user
  ON event_comment_likes(user_id);

ALTER TABLE event_comment_likes ENABLE ROW LEVEL SECURITY;

-- 읽기 전체 공개 — 비로그인도 좋아요 수는 봐야 참여 유인이 생긴다(596·597과 동일)
DROP POLICY IF EXISTS "Anyone can read event comment likes" ON event_comment_likes;
CREATE POLICY "Anyone can read event comment likes" ON event_comment_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Login users can like event comment" ON event_comment_likes;
CREATE POLICY "Login users can like event comment" ON event_comment_likes
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND NOT public.is_blocked_or_deleted(auth.uid())
  );

DROP POLICY IF EXISTS "Delete own event comment like" ON event_comment_likes;
CREATE POLICY "Delete own event comment like" ON event_comment_likes
  FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

CREATE OR REPLACE FUNCTION mark_event_comment_like_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT COALESCE(u.is_test, FALSE) INTO NEW.is_test
    FROM users u WHERE u.id = NEW.user_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_event_comment_like_is_test ON event_comment_likes;
CREATE TRIGGER trg_event_comment_like_is_test
  BEFORE INSERT ON event_comment_likes
  FOR EACH ROW EXECUTE FUNCTION mark_event_comment_like_is_test();

-- like_count 비정규화 — 댓글 목록마다 좋아요를 세는 쿼리를 날리지 않기 위해
ALTER TABLE event_comments
  ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION sync_event_comment_like_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE event_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE event_comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_sync_event_comment_like_count ON event_comment_likes;
CREATE TRIGGER trg_sync_event_comment_like_count
  AFTER INSERT OR DELETE ON event_comment_likes
  FOR EACH ROW EXECUTE FUNCTION sync_event_comment_like_count();

-- 이미 쌓인 좋아요가 있다면(재실행 대비) 카운트를 실제 값으로 맞춘다
UPDATE event_comments c
   SET like_count = COALESCE(l.cnt, 0)
  FROM (
    SELECT comment_id, COUNT(*)::int AS cnt FROM event_comment_likes GROUP BY comment_id
  ) l
 WHERE l.comment_id = c.id AND c.like_count <> l.cnt;

-- 마찬가지로 reply_count도 실제 값으로 정렬
UPDATE event_comments c
   SET reply_count = COALESCE(r.cnt, 0)
  FROM (
    SELECT parent_id, COUNT(*)::int AS cnt
      FROM event_comments
     WHERE parent_id IS NOT NULL AND is_deleted = FALSE
     GROUP BY parent_id
  ) r
 WHERE r.parent_id = c.id AND c.reply_count <> r.cnt;

-- ============================================================================
-- 3) Realtime — 좋아요는 카운트 반영을 위해 구독한다
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'event_comment_likes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE event_comment_likes;
  END IF;
END $$;

-- ============================================================================
-- 4) 공연 채팅방 생성 차단
--    테이블·기존 대화는 남기고 새 방만 막는다(위 헤더의 이유 참조).
-- ============================================================================

DROP POLICY IF EXISTS "Login users can create event room" ON event_chat_rooms;

COMMENT ON TABLE event_chat_rooms IS
  '[중단됨 2026-08-28/Mig602] 공연별 "같이 갈 사람" 채팅방. 대댓글로 대체됐다. '
  '신규 생성 차단(INSERT 정책 없음). 기존 방 대화는 chat_messages(room=event:...)에 남아 있다.';

COMMENT ON TABLE event_comments IS
  '공연 상세 댓글. parent_id로 1-depth 답글, event_comment_likes로 좋아요.';
