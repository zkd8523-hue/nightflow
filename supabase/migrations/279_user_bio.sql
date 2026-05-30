-- Migration 279: 사용자 프로필 자기소개 (bio) 추가
-- 공개 프로필 페이지 (/u/[userId])에서 표시되는 한 줄 자기소개

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio TEXT;

COMMENT ON COLUMN users.bio IS '공개 프로필 페이지에 표시되는 자기소개. 최대 160자.';

-- 길이 제약 (트위터 bio처럼 160자)
ALTER TABLE users
  ADD CONSTRAINT users_bio_length CHECK (bio IS NULL OR char_length(bio) <= 160);
