-- 042: MD 인증 강화 - 인스타그램 검증 + 명함 사진
-- instagram 컬럼은 030_model_b_transition.sql에서 이미 추가됨

-- 1. 기존 잘못된 instagram 데이터 정리 (CHECK 제약 추가 전)
UPDATE users SET instagram = NULL
WHERE instagram IS NOT NULL
  AND instagram !~ '^[a-zA-Z0-9._]{1,30}$';

-- 2. business_card_url 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_card_url TEXT;

-- 3. instagram 형식 제약 (NULL 허용, 값 있으면 1-30자 영문/숫자/./_ 만)
ALTER TABLE users ADD CONSTRAINT check_instagram_format
  CHECK (instagram IS NULL OR instagram ~ '^[a-zA-Z0-9._]{1,30}$');

COMMENT ON COLUMN users.instagram IS 'MD 인스타그램 ID (@ 제외, 영문/숫자/./_ 1-30자)';
COMMENT ON COLUMN users.business_card_url IS 'MD 명함 사진 URL (Supabase Storage)';
