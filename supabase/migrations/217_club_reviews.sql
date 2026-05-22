-- 217: club_reviews
-- 클럽 프로필 리뷰. 누구나(SMS 인증된 유저) 클럽당 1회.
-- 본인 클럽(club_partners) 리뷰는 차단.
-- 텍스트 없음. 미리 정의된 긍정 태그 다중선택만.

CREATE TABLE IF NOT EXISTS club_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  /** 'verified' = auctions/puzzles 거래 검증 / 'self' = 자발적 신고 */
  source TEXT NOT NULL DEFAULT 'self' CHECK (source IN ('verified', 'self')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_reviews_club ON club_reviews(club_id);
CREATE INDEX IF NOT EXISTS idx_club_reviews_user ON club_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_club_reviews_tags ON club_reviews USING GIN (tags);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_club_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_club_reviews_updated_at ON club_reviews;
CREATE TRIGGER trg_club_reviews_updated_at
  BEFORE UPDATE ON club_reviews
  FOR EACH ROW EXECUTE FUNCTION update_club_reviews_updated_at();

-- RLS
ALTER TABLE club_reviews ENABLE ROW LEVEL SECURITY;

-- 읽기: 누구나 (집계 표시용)
DROP POLICY IF EXISTS "Anyone can read club reviews" ON club_reviews;
CREATE POLICY "Anyone can read club reviews" ON club_reviews
  FOR SELECT USING (true);

-- 작성: 본인만 INSERT/UPDATE, 본인 클럽 차단은 API에서 검증
DROP POLICY IF EXISTS "User can insert own review" ON club_reviews;
CREATE POLICY "User can insert own review" ON club_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "User can update own review" ON club_reviews;
CREATE POLICY "User can update own review" ON club_reviews
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User can delete own review" ON club_reviews;
CREATE POLICY "User can delete own review" ON club_reviews
  FOR DELETE USING (auth.uid() = user_id);

-- 집계 뷰: 클럽별 태그 카운트
CREATE OR REPLACE VIEW club_review_tag_counts AS
SELECT
  cr.club_id,
  UNNEST(cr.tags) AS tag,
  COUNT(*)::INTEGER AS cnt,
  SUM(CASE WHEN cr.source = 'verified' THEN 1 ELSE 0 END)::INTEGER AS verified_cnt
FROM club_reviews cr
GROUP BY cr.club_id, UNNEST(cr.tags);

-- 클럽별 총 리뷰 수 뷰
CREATE OR REPLACE VIEW club_review_summary AS
SELECT
  club_id,
  COUNT(*)::INTEGER AS total_reviews,
  SUM(CASE WHEN source = 'verified' THEN 1 ELSE 0 END)::INTEGER AS verified_reviews
FROM club_reviews
GROUP BY club_id;
