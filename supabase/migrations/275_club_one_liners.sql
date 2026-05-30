-- Migration 275: 클럽 한 줄 리뷰 + 좋아요 (멱등성 버전)
--
-- 컨셉: "이 클럽을 한 문장으로 표현해주세요!"
-- - 클럽당 1유저 1리뷰 (수정 가능, 삭제 가능)
-- - 100자 제한, 별점/이미지 없음
-- - 비로그인도 읽기 가능 (사회적 증거)
-- - 좋아요 토글, 본인 글엔 좋아요 불가
--
-- ⚠️ 이 파일은 여러 번 실행해도 안전 (IF NOT EXISTS / DROP IF EXISTS).
-- 277(RLS 헬퍼 패치)이 INSERT 정책을 덮어쓰므로 본 파일의 INSERT 정책은 임시값.

-- ============================================
-- 1) 한 줄 리뷰
-- ============================================
CREATE TABLE IF NOT EXISTS club_one_liners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 100),
  like_count INTEGER NOT NULL DEFAULT 0,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_one_liners_club_pop
  ON club_one_liners(club_id, like_count DESC, created_at DESC)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_one_liners_club_recent
  ON club_one_liners(club_id, created_at DESC)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_one_liners_author
  ON club_one_liners(author_id);

ALTER TABLE club_one_liners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read one-liners" ON club_one_liners;
CREATE POLICY "Anyone can read one-liners"
  ON club_one_liners
  FOR SELECT
  USING (is_deleted = FALSE);

DROP POLICY IF EXISTS "Login users can write one-liner" ON club_one_liners;
CREATE POLICY "Login users can write one-liner"
  ON club_one_liners
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = author_id
  );
-- 차단/파트너 MD 추가 제약은 277에서 헬퍼 함수로 덮어씀

DROP POLICY IF EXISTS "Author can update own one-liner" ON club_one_liners;
CREATE POLICY "Author can update own one-liner"
  ON club_one_liners
  FOR UPDATE
  USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Author or admin can delete one-liner" ON club_one_liners;
CREATE POLICY "Author or admin can delete one-liner"
  ON club_one_liners
  FOR DELETE
  USING (
    auth.uid() = author_id
    OR public.is_admin()
  );

-- ============================================
-- 2) 좋아요
-- ============================================
CREATE TABLE IF NOT EXISTS one_liner_likes (
  one_liner_id UUID NOT NULL REFERENCES club_one_liners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (one_liner_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_one_liner_likes_user ON one_liner_likes(user_id);

ALTER TABLE one_liner_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read likes" ON one_liner_likes;
CREATE POLICY "Anyone can read likes"
  ON one_liner_likes
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Like others only" ON one_liner_likes;
CREATE POLICY "Like others only"
  ON one_liner_likes
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM club_one_liners
      WHERE id = one_liner_id AND author_id = auth.uid()
    )
  );
-- 차단 유저 제약은 277에서 헬퍼 함수로 덮어씀

DROP POLICY IF EXISTS "Cancel own like" ON one_liner_likes;
CREATE POLICY "Cancel own like"
  ON one_liner_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3) like_count 자동 동기화 트리거
-- ============================================
CREATE OR REPLACE FUNCTION sync_one_liner_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE club_one_liners
      SET like_count = like_count + 1
      WHERE id = NEW.one_liner_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE club_one_liners
      SET like_count = GREATEST(like_count - 1, 0)
      WHERE id = OLD.one_liner_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_one_liner_like_count ON one_liner_likes;
CREATE TRIGGER trg_sync_one_liner_like_count
  AFTER INSERT OR DELETE ON one_liner_likes
  FOR EACH ROW EXECUTE FUNCTION sync_one_liner_like_count();

-- ============================================
-- 4) updated_at 트리거 (기존 update_updated_at 재사용)
-- ============================================
DROP TRIGGER IF EXISTS trg_one_liners_updated_at ON club_one_liners;
CREATE TRIGGER trg_one_liners_updated_at
  BEFORE UPDATE ON club_one_liners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 5) 코멘트
-- ============================================
COMMENT ON TABLE club_one_liners IS '클럽 한 줄 리뷰 (1유저 1클럽 1리뷰, 100자 제한)';
COMMENT ON TABLE one_liner_likes IS '한 줄 리뷰 좋아요 (본인 글 제외)';
