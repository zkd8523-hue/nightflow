-- Migration 080: Add user identity fields for Kakao L2 scope
-- birthday, gender, age_verified_at 컬럼 추가
-- age_verified_at은 L3(NICE/PASS CI) 연동 시에도 재사용

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN users.birthday IS '카카오 OAuth에서 수집한 생년월일 (birthyear + birthday 조합)';
COMMENT ON COLUMN users.gender IS '카카오 OAuth에서 수집한 성별 (male/female)';
COMMENT ON COLUMN users.age_verified_at IS '성인 인증 완료 시각. L2: 카카오 생년월일 기반, L3: CI 기반 본인인증 완료 시 갱신';
