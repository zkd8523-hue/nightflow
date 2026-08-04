-- ============================================================================
-- Migration 511: 조각 인당 최소 7만원은 "유저가 올린 조각"에만 적용
-- 날짜: 2026-08-05
-- 배경:
--   356의 check_share_min_budget이 is_recruiting_party 전체에 걸려 있어
--   파트너 직통(host_is_md) 조각까지 인당 7만원 미만이면 INSERT가 막혔다.
--   실제로 "가성비 6만원" 템플릿을 켜도 발행이 전부 실패했다.
--
--   최소가는 유저가 조각을 올릴 때의 기준이다(너무 낮은 금액으로 올려 매칭이
--   성립하지 않는 걸 막기 위한 장치). 파트너는 자기 클럽 가격표를 그대로 파는
--   쪽이므로 가격을 자유롭게 정할 수 있어야 한다 — 가성비존이 6만원일 수 있다.
--
--   → host_is_md면 최소가 검사에서 제외한다.
--
--   NOT VALID 유지: 기존 행 재검증 없이 신규 insert/update만 강제(356과 동일).
-- ============================================================================

ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS check_share_min_budget;
ALTER TABLE puzzles ADD CONSTRAINT check_share_min_budget
  CHECK (
    NOT is_recruiting_party
    OR host_is_md              -- 파트너 직통은 가격 자유
    OR budget_per_person >= 70000
  ) NOT VALID;

COMMENT ON CONSTRAINT check_share_min_budget ON puzzles IS
  '유저가 올린 조각만 인당 7만원 이상. 파트너 직통(host_is_md)은 클럽 가격표를 그대로 쓰므로 제외.';
