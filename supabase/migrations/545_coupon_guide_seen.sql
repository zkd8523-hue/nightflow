-- ============================================================================
-- Migration 545: 쿠폰 가이드 1회 노출 플래그
-- 날짜: 2026-08-24
-- 선행: 523_onboarding_guides.sql (동일 패턴)
--
-- 배경:
--   쿠폰은 파트너 도구 중 유일하게 "승인 비밀번호"라는 사전 준비가 필요하고,
--   유저가 현장에서 쓸 때 MD가 직접 번호를 눌러야 한다는 흐름이 화면만 봐서는
--   드러나지 않는다. 게스트 간판·파티와 같은 방식으로 1회 안내를 붙인다.
--
--   기기(localStorage)가 아니라 계정에 기록해야 기기를 바꿔도 다시 뜨지 않는다.
--   RLS: users 셀프 UPDATE로 클라이언트가 직접 true를 쓴다(기존 플래그들과 동일).
--
-- 실행: Supabase 대시보드 SQL Editor에 붙여넣어 1회 실행. db push 금지.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS coupon_guide_seen BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.coupon_guide_seen IS
  '파트너 쿠폰 가이드(CouponOnboardingSheet) 노출 완료 여부. 계정당 1회. Migration 545';
