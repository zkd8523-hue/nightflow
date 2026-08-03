-- Migration 495: 건의 게시판 (Suggestion Board)
--
-- 배경:
--   유저가 의견을 낼 통로가 고객 문의(support_chat, 1:1) 하나뿐이라 같은 요청이
--   여러 명에게서 반복 접수돼도 관리자만 알고 유저끼리는 공감할 방법이 없었다.
--   건의를 공개 피드로 바꿔 좋아요 = 우선순위 투표, 댓글 = 보완 의견으로 쓴다.
--
-- 핵심 규칙:
--   - is_private(관리자만 보기) = 작성자가 켜면 본인 + admin 외 열람 불가 (기본 OFF)
--   - 공개글은 비로그인도 읽기 가능, 작성·좋아요·댓글은 로그인 필요
--   - 관리자 전용 답변/상태 UI 없음. 관리자도 똑같이 댓글로 답변 (role로 배지만 구분)
--   - 본인 글 좋아요 불가 (chat_shot_likes 316 패턴)
--   - 도배 방지: 1시간 내 동일 본문 차단 (와글 466과 동일 규칙)
--
-- 재사용 헬퍼: public.is_admin() (115), public.is_blocked_or_deleted() (277),
--             update_updated_at() (001), notify_admins_push_url() (480),
--             notify_user_push() 6-arg (312)
--
-- ⚠️ 이 파일은 여러 번 실행해도 안전 (IF NOT EXISTS / DROP IF EXISTS).

-- ============================================
-- 1) 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title   TEXT NOT NULL CHECK (char_length(title)   BETWEEN 2 AND 60),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 5 AND 2000),
  /** 관리자만 보기 — 작성자 + admin 외 열람 불가 */
  is_private    BOOLEAN NOT NULL DEFAULT FALSE,
  like_count    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
  /** 작성자 users.is_test 자동 복사 (트리거) — 프로덕션에서 필터 */
  is_test       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suggestion_likes (
  suggestion_id UUID NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (suggestion_id, user_id)
);

CREATE TABLE IF NOT EXISTS suggestion_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  is_test    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 목록 피드 (공개 + 미삭제 + 실계정)
CREATE INDEX IF NOT EXISTS idx_suggestions_feed
  ON suggestions(created_at DESC)
  WHERE is_deleted = FALSE AND is_private = FALSE AND is_test = FALSE;

-- 공감순 정렬
CREATE INDEX IF NOT EXISTS idx_suggestions_popular
  ON suggestions(like_count DESC, created_at DESC)
  WHERE is_deleted = FALSE AND is_private = FALSE AND is_test = FALSE;

-- 내 건의 / 관리자 비공개 조회
CREATE INDEX IF NOT EXISTS idx_suggestions_author
  ON suggestions(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_suggestion_comments_parent
  ON suggestion_comments(suggestion_id, created_at)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_suggestion_likes_user
  ON suggestion_likes(user_id);

-- ============================================
-- 2) 열람 판정 헬퍼
--    좋아요/댓글 정책에서 재사용. SECURITY DEFINER로 suggestions RLS를 우회해
--    정책 간 재귀 평가를 피한다.
-- ============================================
CREATE OR REPLACE FUNCTION public.can_view_suggestion(p_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM suggestions s
    WHERE s.id = p_id
      AND s.is_deleted = FALSE
      AND (s.is_private = FALSE OR s.author_id = auth.uid() OR public.is_admin())
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_suggestion(UUID) TO anon, authenticated;

-- ============================================
-- 3) RLS — suggestions
-- ============================================
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

-- 조회: 공개글은 비로그인 포함 누구나 / 비공개글은 작성자 + admin
DROP POLICY IF EXISTS "Read public suggestions" ON suggestions;
CREATE POLICY "Read public suggestions"
  ON suggestions
  FOR SELECT
  USING (
    is_deleted = FALSE
    AND (is_private = FALSE OR author_id = auth.uid() OR public.is_admin())
  );

-- 작성: 로그인 + 본인 명의 + 차단/탈퇴 아님
DROP POLICY IF EXISTS "Login users can write suggestion" ON suggestions;
CREATE POLICY "Login users can write suggestion"
  ON suggestions
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
    AND NOT public.is_blocked_or_deleted(auth.uid())
  );

-- 수정/소프트삭제: 작성자 본인 또는 admin (author_id 변조 차단)
DROP POLICY IF EXISTS "Author or admin can update suggestion" ON suggestions;
CREATE POLICY "Author or admin can update suggestion"
  ON suggestions
  FOR UPDATE
  USING (author_id = auth.uid() OR public.is_admin())
  WITH CHECK (author_id = auth.uid() OR public.is_admin());

-- ============================================
-- 4) RLS — suggestion_likes
-- ============================================
ALTER TABLE suggestion_likes ENABLE ROW LEVEL SECURITY;

-- 조회: liked_by_me 판정용 (카운트는 like_count 캐시 사용)
DROP POLICY IF EXISTS "Anyone can read suggestion likes" ON suggestion_likes;
CREATE POLICY "Anyone can read suggestion likes"
  ON suggestion_likes
  FOR SELECT USING (true);

-- 좋아요: 볼 수 있는 글에만, 본인 글은 불가(자추 방지), 차단/탈퇴 불가
DROP POLICY IF EXISTS "Like others suggestions only" ON suggestion_likes;
CREATE POLICY "Like others suggestions only"
  ON suggestion_likes
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND public.can_view_suggestion(suggestion_id)
    AND NOT EXISTS (
      SELECT 1 FROM suggestions s
      WHERE s.id = suggestion_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Cancel own suggestion like" ON suggestion_likes;
CREATE POLICY "Cancel own suggestion like"
  ON suggestion_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 5) RLS — suggestion_comments
-- ============================================
ALTER TABLE suggestion_comments ENABLE ROW LEVEL SECURITY;

-- 조회: 글이 보이는 사람만 (비공개글 댓글은 작성자 + admin만)
DROP POLICY IF EXISTS "Read comments of visible suggestion" ON suggestion_comments;
CREATE POLICY "Read comments of visible suggestion"
  ON suggestion_comments
  FOR SELECT
  USING (
    is_deleted = FALSE
    AND public.can_view_suggestion(suggestion_id)
  );

-- 작성: 볼 수 있는 글에만. admin도 같은 경로로 답변(별도 답변 기능 없음)
DROP POLICY IF EXISTS "Login users can comment suggestion" ON suggestion_comments;
CREATE POLICY "Login users can comment suggestion"
  ON suggestion_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND public.can_view_suggestion(suggestion_id)
  );

DROP POLICY IF EXISTS "Delete own comment or admin" ON suggestion_comments;
CREATE POLICY "Delete own comment or admin"
  ON suggestion_comments
  FOR DELETE
  USING (auth.uid() = author_id OR public.is_admin());

-- ============================================
-- 6) is_test 자동 마킹 (319 패턴)
-- ============================================
CREATE OR REPLACE FUNCTION mark_suggestion_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT COALESCE(u.is_test, FALSE)
    INTO NEW.is_test
    FROM users u
    WHERE u.id = NEW.author_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_suggestion_is_test ON suggestions;
CREATE TRIGGER trg_mark_suggestion_is_test
  BEFORE INSERT ON suggestions
  FOR EACH ROW EXECUTE FUNCTION mark_suggestion_is_test();

DROP TRIGGER IF EXISTS trg_mark_suggestion_comment_is_test ON suggestion_comments;
CREATE TRIGGER trg_mark_suggestion_comment_is_test
  BEFORE INSERT ON suggestion_comments
  FOR EACH ROW EXECUTE FUNCTION mark_suggestion_is_test();

-- ============================================
-- 7) 카운트 캐시 동기화 (316 패턴)
-- ============================================
CREATE OR REPLACE FUNCTION sync_suggestion_like_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE suggestions SET like_count = like_count + 1 WHERE id = NEW.suggestion_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE suggestions SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.suggestion_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_suggestion_like_count ON suggestion_likes;
CREATE TRIGGER trg_sync_suggestion_like_count
  AFTER INSERT OR DELETE ON suggestion_likes
  FOR EACH ROW EXECUTE FUNCTION sync_suggestion_like_count();

-- 댓글은 하드삭제(DELETE)와 소프트삭제(is_deleted=TRUE) 둘 다 반영
CREATE OR REPLACE FUNCTION sync_suggestion_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_deleted = FALSE THEN
      UPDATE suggestions SET comment_count = comment_count + 1 WHERE id = NEW.suggestion_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_deleted = FALSE THEN
      UPDATE suggestions SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.suggestion_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE THEN
      UPDATE suggestions SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.suggestion_id;
    ELSIF OLD.is_deleted = TRUE AND NEW.is_deleted = FALSE THEN
      UPDATE suggestions SET comment_count = comment_count + 1 WHERE id = NEW.suggestion_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_suggestion_comment_count ON suggestion_comments;
CREATE TRIGGER trg_sync_suggestion_comment_count
  AFTER INSERT OR DELETE OR UPDATE OF is_deleted ON suggestion_comments
  FOR EACH ROW EXECUTE FUNCTION sync_suggestion_comment_count();

-- ============================================
-- 8) updated_at (001 헬퍼 재사용)
-- ============================================
DROP TRIGGER IF EXISTS trg_suggestions_updated_at ON suggestions;
CREATE TRIGGER trg_suggestions_updated_at
  BEFORE UPDATE ON suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 9) 도배 방지 — 1시간 내 동일 본문 차단 (466 패턴)
--    클라이언트가 프리픽스로 잡아내므로 'RATE_LIMIT_DUPLICATE:' 유지
-- ============================================
CREATE OR REPLACE FUNCTION enforce_suggestion_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dup INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dup
    FROM suggestions
    WHERE author_id = NEW.author_id
      AND is_deleted = FALSE
      AND created_at >= NEW.created_at - INTERVAL '1 hour'
      AND trim(content) = trim(NEW.content);

  IF v_dup > 0 THEN
    RAISE EXCEPTION 'RATE_LIMIT_DUPLICATE: 1시간 이내 같은 내용은 올릴 수 없어요'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_suggestion_rate_limit ON suggestions;
CREATE TRIGGER trg_enforce_suggestion_rate_limit
  BEFORE INSERT ON suggestions
  FOR EACH ROW EXECUTE FUNCTION enforce_suggestion_rate_limit();

-- 댓글은 같은 글 안에서만 중복 차단 (다른 글에 "저도요"는 정상)
CREATE OR REPLACE FUNCTION enforce_suggestion_comment_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dup INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dup
    FROM suggestion_comments
    WHERE author_id = NEW.author_id
      AND suggestion_id = NEW.suggestion_id
      AND is_deleted = FALSE
      AND created_at >= NEW.created_at - INTERVAL '1 hour'
      AND trim(content) = trim(NEW.content);

  IF v_dup > 0 THEN
    RAISE EXCEPTION 'RATE_LIMIT_DUPLICATE: 1시간 이내 같은 댓글은 달 수 없어요'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_suggestion_comment_rate_limit ON suggestion_comments;
CREATE TRIGGER trg_enforce_suggestion_comment_rate_limit
  BEFORE INSERT ON suggestion_comments
  FOR EACH ROW EXECUTE FUNCTION enforce_suggestion_comment_rate_limit();

-- ============================================
-- 10) 새 건의 → 관리자 전원 딥링크 푸시 (480/488 패턴)
-- ============================================
CREATE OR REPLACE FUNCTION notify_admin_new_suggestion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_author TEXT;
BEGIN
  -- 테스트 계정 글은 푸시 제외
  IF NEW.is_test THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '유저')
    INTO v_author FROM users WHERE id = NEW.author_id;

  PERFORM notify_admins_push_url(
    CASE WHEN NEW.is_private THEN '🔒 새 건의 (비공개)' ELSE '💡 새 건의' END,
    COALESCE(v_author, '유저') || ': ' || left(NEW.title, 30),
    '/suggestions/' || NEW.id,
    jsonb_build_object(
      'type', 'suggestion',
      'suggestion_id', NEW.id::TEXT
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_new_suggestion ON suggestions;
CREATE TRIGGER trg_notify_admin_new_suggestion
  AFTER INSERT ON suggestions
  FOR EACH ROW EXECUTE FUNCTION notify_admin_new_suggestion();

-- ============================================
-- 11) 내 건의에 댓글 → 작성자 푸시
--     카테고리 'suggestion_comment'는 can_send_push CASE에 없어 ELSE TRUE로 떨어짐
--     → 방해금지 시간만 적용, 토글로는 안 막힘 (내 글 답변이라 의도된 동작)
-- ============================================
CREATE OR REPLACE FUNCTION notify_suggestion_author_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_author_id UUID;
  v_title     TEXT;
  v_is_admin  BOOLEAN;
BEGIN
  IF NEW.is_test THEN
    RETURN NEW;
  END IF;

  SELECT author_id, title INTO v_author_id, v_title
    FROM suggestions WHERE id = NEW.suggestion_id;

  -- 본인 글에 본인이 단 댓글은 알림 없음
  IF v_author_id IS NULL OR v_author_id = NEW.author_id THEN
    RETURN NEW;
  END IF;

  SELECT (role = 'admin') INTO v_is_admin FROM users WHERE id = NEW.author_id;

  PERFORM notify_user_push(
    v_author_id,
    CASE WHEN COALESCE(v_is_admin, FALSE) THEN '🛡 관리자 답변' ELSE '💬 건의에 댓글' END,
    left(NEW.content, 40),
    jsonb_build_object(
      'type', 'suggestion_comment',
      'suggestion_id', NEW.suggestion_id::TEXT,
      'comment_id', NEW.id::TEXT
    ),
    '/suggestions/' || NEW.suggestion_id,
    'suggestion_comment'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_suggestion_author_on_comment ON suggestion_comments;
CREATE TRIGGER trg_notify_suggestion_author_on_comment
  AFTER INSERT ON suggestion_comments
  FOR EACH ROW EXECUTE FUNCTION notify_suggestion_author_on_comment();

-- ============================================
-- 12) Realtime publication 등록 (284 패턴)
-- ============================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['suggestions', 'suggestion_comments', 'suggestion_likes']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ============================================
-- 13) 코멘트
-- ============================================
COMMENT ON TABLE suggestions IS
  '건의 게시판. is_private=TRUE(관리자만 보기)면 작성자+admin만 열람. 공개글은 비로그인도 읽기 가능.';
COMMENT ON COLUMN suggestions.is_private IS
  '관리자만 보기 — 작성 시 토글. 목록·상세·댓글 전부 RLS로 차단됨.';
COMMENT ON TABLE suggestion_likes IS
  '건의 공감(좋아요). 본인 글 좋아요 불가. like_count 캐시는 트리거로 동기화.';
COMMENT ON TABLE suggestion_comments IS
  '건의 댓글. 관리자도 동일 경로로 답변하며 UI에서 users.role로 배지만 구분.';
