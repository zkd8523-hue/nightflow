-- 기존 경매의 bid_increment를 시작가 기반으로 일괄 업데이트
-- 규칙: < 30만 → 5000, 30~100만 → 10000, >= 100만 → 20000

UPDATE auctions SET bid_increment = CASE
  WHEN start_price < 300000 THEN 5000
  WHEN start_price < 1000000 THEN 10000
  ELSE 20000
END
WHERE bid_increment = 10000;

-- 스키마 기본값도 변경 (새 경매는 AuctionForm에서 동적으로 설정하지만 안전장치)
ALTER TABLE auctions ALTER COLUMN bid_increment SET DEFAULT 5000;
