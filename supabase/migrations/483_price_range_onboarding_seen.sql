-- Migration 483: 제안가 설정 안내(PriceRangeOnboardingSheet) 노출을 계정 단위로 전환
-- 배경: 기존엔 localStorage(nf_price_range_onboarding_v1_seen, 브라우저/기기 단위)로
--   "봤음"을 저장해서 시크릿 모드/기기 변경/브라우저 데이터 삭제 시 같은 계정에도
--   반복 노출되는 문제가 있었다. chat_update_v1_seen(482)과 동일한 패턴으로
--   users 테이블에 컬럼을 두고 계정당 최초 1회만 노출되도록 한다.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS price_range_onboarding_v1_seen BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.price_range_onboarding_v1_seen
  IS '제안가 ±20% 범위 설정 안내(PriceRangeOnboardingSheet) 노출 완료 여부 (계정당 최초 1회)';
