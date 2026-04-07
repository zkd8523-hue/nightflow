-- Migration 081: 파라미터 없는 구버전 calculate_contact_timer() 제거
-- 날짜: 2026-04-07
-- 문제: 047/059에서 시그니처가 (UUID)로 변경되었으나 무파라미터 버전이 잔존
--      → place_bid()는 calculate_contact_timer(p_bidder_id) 호출하므로 정상이지만
--        함수 오버로딩으로 인한 혼란 및 잠재적 호출 모호성 존재
-- 해결: 무파라미터 버전을 명시적으로 DROP

DROP FUNCTION IF EXISTS calculate_contact_timer();

COMMENT ON FUNCTION calculate_contact_timer(UUID) IS
  'Migration 081: 무파라미터 구버전 제거 후 (UUID) 버전만 유지';
