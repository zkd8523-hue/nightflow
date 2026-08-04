-- ============================================================================
-- Migration 523: 온보딩 가이드 1회 노출 플래그 3종
-- 날짜: 2026-08-05
-- 배경:
--   설명 없이는 오해가 나는 지점 세 곳에 1회짜리 안내 시트를 붙인다.
--   기기(localStorage)가 아니라 계정에 기록해야 기기를 바꿔도 다시 뜨지 않는다.
--   기존 md_onboarding_areas_seen(232) / price_range_onboarding_v1_seen(483)과 동일 패턴.
--
--     share_guide_seen        — 파트너 첫 로그인. 조각 = 세팅 켜두면 자동 발행이라는 흐름
--     offer_credit_guide_seen — 파트너가 깃발 상세에 처음 들어갔을 때. 크레딧이 언제 빠지는지
--     share_join_guide_seen   — 유저가 조각 상세에 처음 들어갔을 때. 앱에서 결제가 없다는 것
--
--   RLS: users 셀프 UPDATE로 클라이언트가 직접 true를 쓴다(기존 플래그들과 동일).
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS share_guide_seen        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS offer_credit_guide_seen BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS share_join_guide_seen   BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.share_guide_seen IS
  '파트너 조각 가이드(ShareOnboardingSheet) 노출 완료 여부. 계정당 1회. Migration 523';
COMMENT ON COLUMN users.offer_credit_guide_seen IS
  '파트너 크레딧 가이드(OfferCreditGuideSheet) 노출 완료 여부. 깃발 상세 첫 진입 1회. Migration 523';
COMMENT ON COLUMN users.share_join_guide_seen IS
  '유저 조각 결제 안내(ShareJoinGuideSheet) 노출 완료 여부. 조각 상세 첫 진입 1회. Migration 523';
