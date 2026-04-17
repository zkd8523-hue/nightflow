-- ============================================
-- Migration 116: users SELECT 정책 복구
-- ============================================
-- 배경: Migration 109에서 "Public user profiles" 정책 DROP 후
-- "Users can read own profile" 정책이 누락되어 로그인 유저가
-- 본인 프로필을 조회하지 못하는 문제 발생.
--
-- 이 마이그레이션은 해당 정책을 안전하게 재생성합니다.

DROP POLICY IF EXISTS "Users can read own profile" ON users;

CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.uid() = id);
