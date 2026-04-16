-- ============================================================================
-- Migration 114: PortOne PASS 본인인증 컬럼 추가 + 가입 시 필수 제약 해제
-- 날짜: 2026-04-17
-- 설명: 실명·전화·생일 수집을 가입 시점이 아닌 행동 시점(입찰/연락/퍼즐참여)
--       으로 이관. PortOne 통합 본인인증 결과(CI/DI/실명/전화/생일/성별/
--       내외국인)를 저장할 컬럼을 추가하고, 기존 필수 제약은 해제한다.
-- ============================================================================

-- 1) 본인인증 관련 컬럼 추가
ALTER TABLE users ADD COLUMN ci TEXT;
ALTER TABLE users ADD COLUMN di TEXT;
ALTER TABLE users ADD COLUMN identity_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN nationality TEXT;

-- 2) 가입 시점에 수집하지 않으므로 name NOT NULL 제약 해제
--    phone/birthday는 이미 nullable
ALTER TABLE users ALTER COLUMN name DROP NOT NULL;

-- 3) CI 유니크 인덱스로 중복 가입 차단 (카카오 계정 우회 방지)
CREATE UNIQUE INDEX idx_users_ci ON users(ci)
  WHERE ci IS NOT NULL AND deleted_at IS NULL;

-- 4) 컬럼 주석
COMMENT ON COLUMN users.ci IS 'PortOne PASS 본인인증 CI (중복 가입 차단 키, 암호화됨)';
COMMENT ON COLUMN users.di IS 'PortOne PASS 본인인증 DI (가맹점 내 식별키)';
COMMENT ON COLUMN users.identity_verified_at IS '본인인증 완료 시각. NULL이면 미인증 상태.';
COMMENT ON COLUMN users.nationality IS '내외국인 구분 (LOCAL | FOREIGNER)';
COMMENT ON COLUMN users.name IS '실명. 가입 시점엔 NULL, 첫 PASS 인증 시 채워짐.';
COMMENT ON COLUMN users.phone IS '전화번호. 가입 시점엔 NULL, 첫 PASS 인증 시 채워짐.';
COMMENT ON COLUMN users.birthday IS '생년월일 (YYYY-MM-DD). 가입 시점엔 NULL, 첫 PASS 인증 시 채워짐.';
