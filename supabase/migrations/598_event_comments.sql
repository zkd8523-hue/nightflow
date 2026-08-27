-- 598: 공연 댓글 + 공연 채팅방
--
-- 구조 (2층)
--   1층: 공연 상세 아래 자유 댓글창 (event_comments)
--   2층: 댓글 작성자가 "같이 갈 사람" 채팅방을 만들어 댓글로 올린다
--        → 방 실체는 기존 chat_messages(와글 인프라)를 그대로 쓴다.
--          room = 'event:<event_id>:<uuid8>' 형태.
--
-- 왜 채팅방을 새로 안 만드는가
--   와글이 이미 Realtime·도배방지(288)·신고·이미지·답글·리액션을 다 갖고 있다.
--   방 하나 더 여는 데 그 전부를 다시 짤 이유가 없다.
--
-- ⚠️ room='all'(전국 와글)은 방 필터 없이 전체를 읽는다(useChatMessages).
--    공연방을 그대로 두면 전국 피드에 공연 대화가 쏟아진다 → 아래 is_scoped 컬럼으로
--    격리하고, 전국 피드는 is_scoped = FALSE만 읽는다.

-- ============================================================================
-- 1) 공연방 격리 플래그
-- ============================================================================

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS is_scoped BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN chat_messages.is_scoped IS
  '특정 대상(공연 등)에 종속된 방의 메시지. 전국 와글(room=all) 피드에서 제외된다.';

-- room CHECK을 넓힌다: 기존 지역 코드 + 'event:<uuid>:<8자>' 패턴
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_room_check;
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_room_check
  CHECK (
    room IN ('all','gangnam','hongdae','itaewon','other','sudogwon','gyeongsang','jeolla')
    OR room ~ '^event:[0-9a-f-]{36}:[0-9a-z]{8}$'
  );

-- 전국 피드가 공연방을 건너뛸 때 쓰는 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_messages_unscoped_time
  ON chat_messages(created_at DESC)
  WHERE is_deleted = FALSE AND is_scoped = FALSE;

-- 공연방 메시지는 자동으로 is_scoped=TRUE. 클라이언트가 빠뜨려도 서버가 보정한다.
CREATE OR REPLACE FUNCTION mark_chat_message_scoped()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_scoped := NEW.room LIKE 'event:%';
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_mark_chat_message_scoped ON chat_messages;
CREATE TRIGGER trg_mark_chat_message_scoped
  BEFORE INSERT OR UPDATE OF room ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION mark_chat_message_scoped();

-- ============================================================================
-- 2) 공연 채팅방
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_chat_rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- chat_messages.room에 들어가는 실제 키
  room       TEXT NOT NULL UNIQUE CHECK (room ~ '^event:[0-9a-f-]{36}:[0-9a-z]{8}$'),
  title      TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 40),
  is_test    BOOLEAN NOT NULL DEFAULT FALSE,
  is_closed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 공연당 1인 1개 — 댓글은 여러 개 써도 방만 제한한다
  UNIQUE(event_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_event_chat_rooms_event
  ON event_chat_rooms(event_id, created_at DESC);

ALTER TABLE event_chat_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read event rooms" ON event_chat_rooms;
CREATE POLICY "Anyone can read event rooms"
  ON event_chat_rooms FOR SELECT USING (true);

-- 지난 공연에는 방을 못 만든다 (읽기 전용 정책)
DROP POLICY IF EXISTS "Login users can create event room" ON event_chat_rooms;
CREATE POLICY "Login users can create event room"
  ON event_chat_rooms FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = creator_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND EXISTS (
      SELECT 1 FROM club_events e
      WHERE e.id = event_id
        AND e.event_date >= (now() AT TIME ZONE 'Asia/Seoul')::date
    )
  );

DROP POLICY IF EXISTS "Creator or admin can update event room" ON event_chat_rooms;
CREATE POLICY "Creator or admin can update event room"
  ON event_chat_rooms FOR UPDATE USING (
    auth.uid() = creator_id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Creator or admin can delete event room" ON event_chat_rooms;
CREATE POLICY "Creator or admin can delete event room"
  ON event_chat_rooms FOR DELETE USING (
    auth.uid() = creator_id OR public.is_admin()
  );

CREATE OR REPLACE FUNCTION mark_event_chat_room_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.is_test := COALESCE((SELECT is_test FROM users WHERE id = NEW.creator_id), FALSE);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_mark_event_chat_room_is_test ON event_chat_rooms;
CREATE TRIGGER trg_mark_event_chat_room_is_test
  BEFORE INSERT ON event_chat_rooms
  FOR EACH ROW EXECUTE FUNCTION mark_event_chat_room_is_test();

-- ============================================================================
-- 3) 공연 댓글
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 사진만 올리는 댓글도 있다 → 미디어가 있으면 본문은 비어도 된다 (아래 CHECK)
  content    TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 300),
  -- 와글과 같은 형식·같은 버킷(chat-media, Migration 287)을 쓴다
  media      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 채팅방을 올린 댓글이면 여기에 방이 매달린다. 방이 지워지면 댓글은 남고 카드만 사라진다.
  room_id    UUID REFERENCES event_chat_rooms(id) ON DELETE SET NULL,
  is_test    BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ⚠️ CREATE TABLE IF NOT EXISTS는 테이블이 이미 있으면 컬럼을 추가하지 않는다.
--    (media 없는 버전으로 먼저 만들어진 DB가 있어 아래 CHECK가 42703으로 터졌다)
--    재실행 안전하게 컬럼을 명시적으로 보강한다.
ALTER TABLE event_comments
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

-- content도 마찬가지 — 사진만 올린 댓글을 위해 NOT NULL DEFAULT ''로 완화한다
ALTER TABLE event_comments ALTER COLUMN content SET DEFAULT '';
DO $$
BEGIN
  -- 기존 CHECK(char_length BETWEEN 1 AND 300)가 남아 있으면 사진 전용 댓글이 막힌다
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'event_comments'::regclass
      AND conname = 'event_comments_content_check'
  ) THEN
    ALTER TABLE event_comments DROP CONSTRAINT event_comments_content_check;
  END IF;
END $$;

ALTER TABLE event_comments DROP CONSTRAINT IF EXISTS event_comments_content_len;
ALTER TABLE event_comments
  ADD CONSTRAINT event_comments_content_len CHECK (char_length(content) <= 300);

-- 본문과 사진이 둘 다 비어 있는 댓글은 만들 수 없다
ALTER TABLE event_comments DROP CONSTRAINT IF EXISTS event_comments_not_empty;
ALTER TABLE event_comments
  ADD CONSTRAINT event_comments_not_empty
  CHECK (char_length(content) > 0 OR jsonb_array_length(media) > 0);

ALTER TABLE event_comments DROP CONSTRAINT IF EXISTS event_comments_media_check;
ALTER TABLE event_comments
  ADD CONSTRAINT event_comments_media_check
  CHECK (jsonb_typeof(media) = 'array' AND jsonb_array_length(media) <= 4);

CREATE INDEX IF NOT EXISTS idx_event_comments_event
  ON event_comments(event_id, created_at ASC)
  WHERE is_deleted = FALSE;

ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read event comments" ON event_comments;
CREATE POLICY "Anyone can read event comments"
  ON event_comments FOR SELECT USING (is_deleted = FALSE);

-- 지난 공연은 읽기 전용 — 새 댓글을 막는다
DROP POLICY IF EXISTS "Login users can comment on event" ON event_comments;
CREATE POLICY "Login users can comment on event"
  ON event_comments FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = author_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND EXISTS (
      SELECT 1 FROM club_events e
      WHERE e.id = event_id
        AND e.event_date >= (now() AT TIME ZONE 'Asia/Seoul')::date
    )
  );

DROP POLICY IF EXISTS "Author or admin can delete event comment" ON event_comments;
CREATE POLICY "Author or admin can delete event comment"
  ON event_comments FOR DELETE USING (
    auth.uid() = author_id OR public.is_admin()
  );

CREATE OR REPLACE FUNCTION mark_event_comment_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.is_test := COALESCE((SELECT is_test FROM users WHERE id = NEW.author_id), FALSE);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_mark_event_comment_is_test ON event_comments;
CREATE TRIGGER trg_mark_event_comment_is_test
  BEFORE INSERT ON event_comments
  FOR EACH ROW EXECUTE FUNCTION mark_event_comment_is_test();

-- ============================================================================
-- 4) 도배 방지 — 와글(288)과 같은 기준: 5초 간격, 분당 10개, 연속 중복 차단
-- ============================================================================

CREATE OR REPLACE FUNCTION check_event_comment_spam()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last_at      TIMESTAMPTZ;
  v_last_content TEXT;
  v_minute_count INTEGER;
BEGIN
  SELECT created_at, content INTO v_last_at, v_last_content
    FROM event_comments
   WHERE author_id = NEW.author_id AND is_deleted = FALSE
   ORDER BY created_at DESC LIMIT 1;

  IF v_last_at IS NOT NULL AND v_last_at > now() - interval '5 seconds' THEN
    RAISE EXCEPTION '조금 천천히 입력해주세요';
  END IF;

  -- 빈 본문(사진만 올린 댓글)은 중복 판정에서 제외한다 — 사진 두 장을
  -- 연속으로 올리면 둘 다 content=''라 무조건 걸린다.
  IF v_last_content IS NOT NULL AND v_last_content <> ''
     AND v_last_content = NEW.content THEN
    RAISE EXCEPTION '같은 내용을 연속으로 올릴 수 없습니다';
  END IF;

  SELECT COUNT(*) INTO v_minute_count
    FROM event_comments
   WHERE author_id = NEW.author_id
     AND created_at > now() - interval '1 minute';

  IF v_minute_count >= 10 THEN
    RAISE EXCEPTION '잠시 후 다시 시도해주세요';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_check_event_comment_spam ON event_comments;
CREATE TRIGGER trg_check_event_comment_spam
  BEFORE INSERT ON event_comments
  FOR EACH ROW EXECUTE FUNCTION check_event_comment_spam();

-- ============================================================================
-- 5) Realtime
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'event_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE event_comments;
  END IF;
END $$;

COMMENT ON TABLE event_comments IS '공연 상세 자유 댓글. room_id가 있으면 채팅방을 올린 댓글.';
COMMENT ON TABLE event_chat_rooms IS '공연별 "같이 갈 사람" 채팅방. 실체는 chat_messages(room=event:<id>:<n>).';
