-- ============================================================================
-- Migration 459: 클럽 구글 리뷰 미리보기 (google_reviews)
--
-- 배경: 외국인 클럽 상세 시트에서 "구글에서 검색" 링크만으로는 이탈 → 실제
--      리뷰 텍스트(최대 5개)를 시트 안에 미리보기로 보여줌 (Places API New,
--      Place Details Enterprise+Atmosphere SKU, scripts/ingest-google-ratings.mjs 확장 예정).
-- ============================================================================

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS google_reviews JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN clubs.google_reviews IS
  'Google Places API 리뷰 캐시 (최대 5개). [{author_name, rating, relative_time, text}]. ingest-google-ratings.mjs가 월 1회 갱신.';
