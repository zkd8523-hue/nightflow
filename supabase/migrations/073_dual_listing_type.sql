-- ============================================================================
-- Migration 073: 듀얼 모델 (얼리버드 경매 + 오늘 특가 즉시구매)
-- 날짜: 2026-03-25
-- 설명: listing_type 컬럼 추가, BIN 제약 수정, contact_timer 10분 변경
-- ============================================================================

-- 1. listing_type 컬럼 추가 (기본값 'auction' = 하위 호환)
ALTER TABLE auctions
  ADD COLUMN listing_type TEXT NOT NULL DEFAULT 'auction'
  CHECK (listing_type IN ('auction', 'instant'));

CREATE INDEX idx_auctions_listing_type ON auctions(listing_type);

-- 2. BIN 가격 제약 수정 (instant에서 buy_now_price = start_price 허용)
ALTER TABLE auctions DROP CONSTRAINT IF EXISTS check_bin_price;
ALTER TABLE auctions ADD CONSTRAINT check_bin_price CHECK (
  buy_now_price IS NULL
  OR (listing_type = 'instant' AND buy_now_price = start_price)
  OR (listing_type = 'auction' AND buy_now_price >= start_price * 1.5)
);

-- 3. 복합 인덱스 (탭 필터링 + 상태 조회 성능)
CREATE INDEX idx_auctions_listing_type_status ON auctions(listing_type, status);

-- 4. 템플릿에도 listing_type 추가
ALTER TABLE auction_templates
  ADD COLUMN listing_type TEXT NOT NULL DEFAULT 'auction'
  CHECK (listing_type IN ('auction', 'instant'));

-- 5. contact_deadline 10분으로 변경 (기존 15분 → 10분)
CREATE OR REPLACE FUNCTION calculate_contact_timer(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
BEGIN
  RETURN 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
