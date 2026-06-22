-- 320: users.country_code — 외국인 국가 코드 저장
-- ISO 3166-1 alpha-2 코드 (US, JP, CN, TW, ...)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS country_code TEXT;

COMMENT ON COLUMN users.country_code IS
  'ISO 3166-1 alpha-2 국가 코드. 외국인 가입 시 선택. KR=한국인(선택적).';
