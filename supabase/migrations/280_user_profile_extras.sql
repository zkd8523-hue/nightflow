-- Migration 280: 공개 프로필 확장
-- 좋아하는 음악 장르 / 주로 가는 지역 / 좋아하는 클럽 (최대 3개씩)
--
-- ⚠️ 주의: user_favorite_clubs 테이블(Migration 070)은 "찜 목록" 용도이며 이 마이그레이션과 무관.
-- 본 마이그레이션은 공개 프로필의 "좋아하는 클럽 3개" 전시용으로 user_pinned_clubs 신규 생성.

-- 1. 음악 장르 (배열, 최대 3개)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_music_genres TEXT[] DEFAULT '{}';

ALTER TABLE users
  ADD CONSTRAINT users_music_genres_max
  CHECK (preferred_music_genres IS NULL OR array_length(preferred_music_genres, 1) IS NULL OR array_length(preferred_music_genres, 1) <= 3);

COMMENT ON COLUMN users.preferred_music_genres IS '공개 프로필: 좋아하는 음악 장르 (최대 3개). 코드: hiphop, rnb, edm, house, techno, pop, kpop, latin, trap, disco';

-- 2. 주로 가는 지역 (배열, 최대 3개)
-- 기존 users.area (text[]) 컬럼은 MD 활동 지역으로 사용 중이라 분리
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_areas TEXT[] DEFAULT '{}';

ALTER TABLE users
  ADD CONSTRAINT users_preferred_areas_max
  CHECK (preferred_areas IS NULL OR array_length(preferred_areas, 1) IS NULL OR array_length(preferred_areas, 1) <= 3);

COMMENT ON COLUMN users.preferred_areas IS '공개 프로필: 주로 가는 지역 (최대 3개). AREA_OPTIONS와 동일 (강남/홍대/이태원/대구/부산/광주)';

-- 3. 공개 프로필 "좋아하는 클럽 3개" 전시용 별도 테이블
-- user_favorite_clubs (Migration 070, 찜 기능)와 다름:
--   - user_favorite_clubs = 알림 수신용 찜 (무제한, 비공개)
--   - user_pinned_clubs   = 공개 프로필 노출용 (최대 3개, 순서 있음)
CREATE TABLE IF NOT EXISTS user_pinned_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_user_pinned_clubs_user
  ON user_pinned_clubs(user_id, sort_order);

ALTER TABLE user_pinned_clubs ENABLE ROW LEVEL SECURITY;

-- RLS: 누구나 읽기 가능 (공개 프로필용)
CREATE POLICY "Anyone can read pinned clubs"
  ON user_pinned_clubs FOR SELECT
  USING (true);

-- RLS: 본인만 자기 핀 클럽 관리
CREATE POLICY "Users can manage own pinned clubs"
  ON user_pinned_clubs FOR ALL
  USING (auth.uid() = user_id);

-- 최대 3개 제한 트리거
CREATE OR REPLACE FUNCTION check_user_pinned_clubs_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM user_pinned_clubs WHERE user_id = NEW.user_id) >= 3 THEN
    RAISE EXCEPTION '좋아하는 클럽은 최대 3개까지 등록할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_pinned_clubs_limit
  BEFORE INSERT ON user_pinned_clubs
  FOR EACH ROW
  EXECUTE FUNCTION check_user_pinned_clubs_limit();
