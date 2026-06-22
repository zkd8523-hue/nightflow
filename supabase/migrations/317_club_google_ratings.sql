-- Migration 317: 클럽 구글 평점·리뷰수 (외국인 /en 추천순 정렬용)
-- - 외국인은 구글을 신뢰하고 구글 리뷰는 자동 번역됨 → 추천순의 신뢰 신호
-- - Google Places API(New) searchText로 주기적 인제스션 (scripts/ingest-google-ratings.mjs)
-- - 라이브 호출 대신 DB 캐시 → 서버 정렬, 비용/CORS 회피

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS google_place_id TEXT,
  ADD COLUMN IF NOT EXISTS google_rating NUMERIC(2,1),        -- 0.0 ~ 5.0
  ADD COLUMN IF NOT EXISTS google_review_count INTEGER,
  ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;

-- 추천순 정렬 인덱스: 평점 desc, 동률이면 리뷰수 desc (NULL은 뒤로)
CREATE INDEX IF NOT EXISTS idx_clubs_google_rating
  ON clubs (google_rating DESC NULLS LAST, google_review_count DESC NULLS LAST);

COMMENT ON COLUMN clubs.google_rating IS
  '구글 평점(0.0~5.0). Places API로 인제스션. 외국인 /en 추천순 정렬 신호.';
COMMENT ON COLUMN clubs.google_review_count IS
  '구글 리뷰 수. 평점 동률 시 정렬 보조 + 신뢰도(리뷰 적은 곳 후순위).';
