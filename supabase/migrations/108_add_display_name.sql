-- ============================================
-- Migration 108: display_name 컬럼 추가
-- ============================================
-- 배경: users.name(실명)이 비로그인 유저에게까지 공개되는 프라이버시 문제 해결.
-- 공개 식별자(display_name)와 실명(name)을 분리한다.
--
-- 본 마이그레이션:
--  1) display_name 컬럼 추가 (nullable)
--  2) 기존 레코드 backfill: '유저' + id 앞 6자
--     -> 첫 로그인 시 middleware가 /onboarding/display-name으로 유도
--  3) NOT NULL + 길이 CHECK + 대소문자 무시 유니크 인덱스
--
-- 마이그레이션 109에서 users RLS를 강화하고 public_user_profiles VIEW를 노출한다.

ALTER TABLE users ADD COLUMN display_name TEXT;

-- 기존 유저 backfill: 실명 복사 금지 (노출 지속 방지)
UPDATE users
SET display_name = '유저' || SUBSTR(id::text, 1, 6)
WHERE display_name IS NULL;

ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;

ALTER TABLE users ADD CONSTRAINT check_display_name_length
  CHECK (char_length(display_name) BETWEEN 2 AND 16);

-- 대소문자 구분 없이 중복 방지, 탈퇴 계정은 제외
CREATE UNIQUE INDEX idx_users_display_name_ci
  ON users(LOWER(display_name))
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN users.display_name IS
  '경매 입찰 등 공개 노출용 닉네임. 실명(name)과 분리. 2-16자, 대소문자 무시 유니크.';
