-- ============================================================================
-- Migration 232: MD 관심 지역 온보딩 플래그
-- 날짜: 2026-05-24
-- 설명:
--   MD 승인 직후 대시보드 진입 시 1회 노출되는 "관심 지역 설정" 온보딩 시트.
--   사용자가 저장 또는 "나중에" 선택 시 플래그를 TRUE로 마킹해 재노출 차단.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS md_onboarding_areas_seen BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.md_onboarding_areas_seen
  IS 'MD 관심 지역 온보딩 시트 노출 완료 여부 (저장 또는 나중에 선택 시 TRUE)';
