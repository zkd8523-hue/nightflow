-- Migration 278: 한 줄 리뷰에 태그 추가
-- - club_one_liners.tags: 클럽 태그 코드 배열 (예: ['music_fire', 'dj_lineup'])
-- - 태그 정의는 클라이언트 코드(src/lib/clubs/oneLinerTags.ts)에서 관리
-- - 클럽별 태그 카운트 집계는 unnest + group by

ALTER TABLE club_one_liners
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- GIN 인덱스: 클럽별 태그 카운트 집계 시 빠른 unnest
CREATE INDEX IF NOT EXISTS idx_one_liners_tags
  ON club_one_liners USING GIN (tags)
  WHERE is_deleted = FALSE;

COMMENT ON COLUMN club_one_liners.tags IS
  '클럽 한 줄 리뷰에 부착된 태그 코드 배열. 정의는 클라이언트 oneLinerTags.ts 참조.';
