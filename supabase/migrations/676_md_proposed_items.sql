-- ============================================================================
-- Migration 676: MD가 제안서에서 적는 "추천 구성" (주류 제안 요청 전용)
--
-- 손님이 메뉴를 직접 고르지 않고 "예산만 고르면 클럽이 세트를 제안"(MD 추천,
-- selected_menu.md_recommend)으로 요청하면 구성이 비어 있다. 그런데 제안서에서
-- MD가 아무것도 적지 않고 "가능합니다"만 눌러 승인할 수 있었다 — 손님은 무엇을
-- 받는지 모른 채 확정으로 넘어간다(2026-09-30).
--
-- 주류 제안 요청은 승인할 때 MD가 예산 안에서 드릴 구성을 반드시 적게 하고
-- (/api/proposal-response가 비어 있으면 거부), 그 내용을 여기 저장한다.
-- 한 줄에 한 품목(자유 텍스트) — 어드민 확정서 "포함 내역" 기본값으로 그대로 옮긴다.
-- 거절하거나 MD가 바뀌면 NULL로 지운다(다른 md_* 응답 컬럼과 같은 수명).
--
-- 두 트랙(foreign_requests, korean_booking_requests)이 같은 제안서/응답 API를
-- 공유하므로 두 테이블에 같은 컬럼을 둔다(Migration 654와 같은 방식).
-- ============================================================================

ALTER TABLE foreign_requests
  ADD COLUMN IF NOT EXISTS md_proposed_items TEXT;

ALTER TABLE korean_booking_requests
  ADD COLUMN IF NOT EXISTS md_proposed_items TEXT;

COMMENT ON COLUMN foreign_requests.md_proposed_items IS
  '주류 제안(MD 추천) 요청에 MD가 승인하며 적은 추천 구성. 한 줄에 한 품목. Migration 676';
COMMENT ON COLUMN korean_booking_requests.md_proposed_items IS
  '주류 제안(MD 추천) 요청에 MD가 승인하며 적은 추천 구성. 한 줄에 한 품목. Migration 676';
