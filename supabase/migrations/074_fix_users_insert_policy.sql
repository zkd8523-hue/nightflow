-- ============================================================================
-- Migration 074: Users 테이블 INSERT RLS 정책 추가
-- 날짜: 2026-03-27
-- 설명: 신규 사용자 회원가입 시 users 테이블에 INSERT 가능하도록 정책 추가
-- ============================================================================

-- 사용자가 자기 자신의 프로필을 생성할 수 있도록 허용
-- auth.uid()와 일치하는 id로만 INSERT 가능 (보안 강화)
CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "Users can insert own profile" ON users IS
  '신규 회원가입: auth.uid()와 일치하는 id로만 INSERT 허용';

-- 정책 검증 쿼리 (주석)
-- 테스트:
-- 1) 카카오 OAuth 로그인 후 /signup 접속
-- 2) SignupForm에서 이름/전화번호 입력 후 제출
-- 3) users 테이블에 레코드 생성 확인
-- 4) 다른 user_id로 INSERT 시도하면 RLS 거부 확인
