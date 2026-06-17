-- Migration 313: 클럽 워드클라우드 ("이 장소 하면 떠오르는 단어")
--
-- 기존 한 줄 리뷰(club_one_liners)를 대체하는 5자 리뷰 워드클라우드.
-- - 인당 1~2개, 5자 이내. 클럽당 1회 작성(수정/삭제 가능).
-- - 좋아요/신고/큐레이션 태그 없음 (단순화).
-- - 비로그인 읽기 OK, 로그인 유저만 작성/수정/삭제.
-- - 집계(빈도/최빈 표기)는 클라이언트에서 처리하므로 뷰는 만들지 않음.
--
-- ⚠️ club_one_liners 등 구 테이블은 여기서 DROP하지 않음(데이터 보존).
--    코드에서 미참조로 전환만 하고, 정리는 추후 별도 마이그레이션에서.
-- ⚠️ 이 파일은 여러 번 실행해도 안전 (IF NOT EXISTS / DROP IF EXISTS).

CREATE TABLE IF NOT EXISTS club_word_clouds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  words TEXT[] NOT NULL CHECK (array_length(words, 1) BETWEEN 1 AND 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_word_clouds_club ON club_word_clouds(club_id);
CREATE INDEX IF NOT EXISTS idx_word_clouds_author ON club_word_clouds(author_id);

ALTER TABLE club_word_clouds ENABLE ROW LEVEL SECURITY;

-- 비로그인 포함 누구나 읽기 (사회적 증거)
DROP POLICY IF EXISTS "Anyone can read word clouds" ON club_word_clouds;
CREATE POLICY "Anyone can read word clouds"
  ON club_word_clouds
  FOR SELECT
  USING (true);

-- 로그인 유저는 본인 명의로만 작성
DROP POLICY IF EXISTS "Login users can write word cloud" ON club_word_clouds;
CREATE POLICY "Login users can write word cloud"
  ON club_word_clouds
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = author_id
  );

-- 본인 것만 수정
DROP POLICY IF EXISTS "Author can update own word cloud" ON club_word_clouds;
CREATE POLICY "Author can update own word cloud"
  ON club_word_clouds
  FOR UPDATE
  USING (auth.uid() = author_id);

-- 본인 또는 admin 삭제
DROP POLICY IF EXISTS "Author or admin can delete word cloud" ON club_word_clouds;
CREATE POLICY "Author or admin can delete word cloud"
  ON club_word_clouds
  FOR DELETE
  USING (
    auth.uid() = author_id
    OR public.is_admin()
  );

-- updated_at 자동 갱신 (기존 update_updated_at 재사용)
DROP TRIGGER IF EXISTS trg_word_clouds_updated_at ON club_word_clouds;
CREATE TRIGGER trg_word_clouds_updated_at
  BEFORE UPDATE ON club_word_clouds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE club_word_clouds IS '클럽 5자 리뷰 워드클라우드 (1유저 1클럽 1row, 단어 1~2개·각 5자, club_one_liners 대체)';
