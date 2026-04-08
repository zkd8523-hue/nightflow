-- ============================================================================
-- Migration 089: 얼리버드 타이밍 규칙 단순화
--
-- 변경사항:
-- 1) calculate_contact_timer_for_auction() 단순화
--    기존(087): event_date 임박도에 따라 30분/180분 분기
--    변경: auction → 60분 단일 / instant → NULL
--
-- 2) auctions 테이블에 CHECK constraint 추가
--    얼리버드 경매는 KST 21:00 마감 + 이벤트 -2일 이상 이전
--    NOT VALID로 기존 데이터 보존 (신규 INSERT/UPDATE만 강제)
--
-- 배경:
-- - 마감 시각을 21:00 KST로 고정 + 이벤트 -2일 이전 규칙으로
--   낙찰 타이밍이 항상 이벤트 충분히 전이 됨 → 긴 타이머 불필요
-- - 60분은 MD 불확실성 최소화 + 유저가 잠들기 전 연락 가능 시간대
-- - Migration 087의 event_proximity 로직은 deprecated
-- ============================================================================

-- 1) calculate_contact_timer_for_auction() 재정의
CREATE OR REPLACE FUNCTION calculate_contact_timer_for_auction(p_auction_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_listing_type TEXT;
BEGIN
  SELECT listing_type INTO v_listing_type FROM auctions WHERE id = p_auction_id;
  IF v_listing_type = 'auction' THEN
    RETURN 60;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION calculate_contact_timer_for_auction(UUID) IS
  'Migration 089: 얼리버드=60분 단일 / instant=NULL. Migration 087 event_proximity deprecated.';

-- 2) CHECK constraint 추가 (NOT VALID — 기존 데이터 보존)
--    조건:
--    - listing_type != 'auction'이거나
--    - auction_end_at IS NULL이거나
--    - 다음 모두 만족:
--      (a) KST 기준 정확히 21:00:00
--      (b) 이벤트일과 마감일의 차이가 2일 이상
ALTER TABLE auctions
  DROP CONSTRAINT IF EXISTS check_earlybird_end_timing;

ALTER TABLE auctions
  ADD CONSTRAINT check_earlybird_end_timing
  CHECK (
    listing_type <> 'auction'
    OR auction_end_at IS NULL
    OR (
      EXTRACT(HOUR FROM auction_end_at AT TIME ZONE 'Asia/Seoul') = 21
      AND EXTRACT(MINUTE FROM auction_end_at AT TIME ZONE 'Asia/Seoul') = 0
      AND EXTRACT(SECOND FROM auction_end_at AT TIME ZONE 'Asia/Seoul') = 0
      AND (event_date - (auction_end_at AT TIME ZONE 'Asia/Seoul')::date) >= 2
    )
  ) NOT VALID;

COMMENT ON CONSTRAINT check_earlybird_end_timing ON auctions IS
  'Migration 089: 얼리버드 마감 = KST 21:00 고정 + 이벤트 -2일 이상 이전. NOT VALID로 기존 데이터 보존.';
