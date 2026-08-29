-- ============================================================================
-- Migration 608: 아티스트 찜 (user_favorite_artists)
-- 날짜: 2026-08-30
-- 선행: 568 (artists)
--
-- 570(DJ 찜)과 완전히 같은 구조의 4번째 인스턴스다(070 클럽 · 083 MD · 570 DJ).
-- 훅·하트 버튼 레이어까지 1:1로 대응된다.
--
-- 쓰임새는 570과 조금 다르다:
--   - /artists/[slug]에서 하트를 눌러 찜한다
--   - /events 목록에서 **찜한 아티스트가 나오는 공연을 날짜 그룹 최상단으로** 올린다
--     (필터가 아니라 정렬 — 나머지 공연도 계속 보인다)
--   - 라인업(출연진) 이름 옆에 하트를 띄운다
--
-- 배열 컬럼이 아니라 조인 테이블을 쓰는 근거는 570과 동일하다:
--   개수 무제한 + 역방향 조회("이 아티스트를 찜한 유저 전원")가 알림 팬아웃에 필요.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_favorite_artists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_id  UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 훅이 23505(중복 키)를 잡아 "이미 찜함"으로 흡수하는 근거
  UNIQUE(user_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_artists_user   ON user_favorite_artists(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_artists_artist ON user_favorite_artists(artist_id);

ALTER TABLE user_favorite_artists ENABLE ROW LEVEL SECURITY;

-- 570과 동일: 본인 찜만 관리 가능.
DROP POLICY IF EXISTS "Users can manage own artist favorites" ON user_favorite_artists;
CREATE POLICY "Users can manage own artist favorites" ON user_favorite_artists
  FOR ALL USING (auth.uid() = user_id);

COMMENT ON TABLE user_favorite_artists IS
  '유저가 찜한 아티스트. /events 목록에서 날짜 그룹 내 정렬 우선순위 + 출연진 하트 표시에 쓴다(필터 아님).';
