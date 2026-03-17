-- 경매 테이블에서 instant_entry 컬럼 제거
ALTER TABLE auctions DROP COLUMN IF EXISTS instant_entry;
