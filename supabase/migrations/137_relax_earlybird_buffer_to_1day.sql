-- ============================================================================
-- Migration 137: 얼리버드 마감 버퍼 -2일 → -1일(전날)로 완화
-- 날짜: 2026-05-07
-- 설명: Migration 089의 check_earlybird_end_timing constraint를
--       이벤트 -2일 이상 이전 → 이벤트 -1일 이상 이전으로 완화.
--       기존 데이터는 모두 새 조건도 만족하므로 영향 없음.
-- ============================================================================

ALTER TABLE auctions
  DROP CONSTRAINT IF EXISTS check_earlybird_end_timing;

ALTER TABLE auctions
  ADD CONSTRAINT check_earlybird_end_timing
  CHECK (
    listing_type <> 'auction'
    OR auction_end_at IS NULL
    OR (
      EXTRACT(HOUR   FROM auction_end_at AT TIME ZONE 'Asia/Seoul') = 21
      AND EXTRACT(MINUTE FROM auction_end_at AT TIME ZONE 'Asia/Seoul') = 0
      AND EXTRACT(SECOND FROM auction_end_at AT TIME ZONE 'Asia/Seoul') = 0
      AND (event_date - (auction_end_at AT TIME ZONE 'Asia/Seoul')::date) >= 1
    )
  ) NOT VALID;

COMMENT ON CONSTRAINT check_earlybird_end_timing ON auctions IS
  'Migration 137: 얼리버드 마감 = KST 21:00 고정 + 이벤트 전날 이상 이전. 089(2일)에서 완화.';
