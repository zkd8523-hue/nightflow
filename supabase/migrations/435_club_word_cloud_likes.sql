-- Migration 435: 클럽 워드클라우드 단어 좋아요
--
-- 5자 리뷰 워드클라우드(club_word_clouds)의 각 단어에 좋아요.
-- - 좋아요는 특정 작성자 row가 아니라 "클럽 × 정규화된 단어" 단위에 붙는다.
--   ("너무재밌다"를 누가 썼든 그 단어 개념에 좋아요가 쌓임 = 클라이언트 집계 키와 일치)
-- - 유저당 같은 단어 1회.
-- - 비로그인 읽기 OK, 로그인 유저만 본인 명의로 추가/취소.
-- - 좋아요 수는 워드클라우드 글자 크기 가중치 + 시트 내 카운트로 사용(클라이언트 집계).
--
-- ⚠️ 이 파일은 여러 번 실행해도 안전 (IF NOT EXISTS / DROP IF EXISTS).

CREATE TABLE IF NOT EXISTS club_word_cloud_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  normalized_word TEXT NOT NULL,          -- normalizeWord() 결과 (집계 키와 동일)
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, normalized_word, user_id)
);

CREATE INDEX IF NOT EXISTS idx_word_cloud_likes_club ON club_word_cloud_likes(club_id);

ALTER TABLE club_word_cloud_likes ENABLE ROW LEVEL SECURITY;

-- 비로그인 포함 누구나 읽기 (사회적 증거 / 카운트 표시)
DROP POLICY IF EXISTS "Anyone can read word cloud likes" ON club_word_cloud_likes;
CREATE POLICY "Anyone can read word cloud likes"
  ON club_word_cloud_likes
  FOR SELECT
  USING (true);

-- 로그인 유저는 본인 명의로만 좋아요 추가
DROP POLICY IF EXISTS "Login users can add word cloud like" ON club_word_cloud_likes;
CREATE POLICY "Login users can add word cloud like"
  ON club_word_cloud_likes
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
  );

-- 본인 좋아요만 취소
DROP POLICY IF EXISTS "User can remove own word cloud like" ON club_word_cloud_likes;
CREATE POLICY "User can remove own word cloud like"
  ON club_word_cloud_likes
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE club_word_cloud_likes IS '클럽 5자 리뷰 워드클라우드 단어 좋아요 (클럽×정규화단어×유저 1회, club_word_clouds 보조)';
