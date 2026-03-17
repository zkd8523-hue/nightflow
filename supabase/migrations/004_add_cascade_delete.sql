-- FK 제약조건에 ON DELETE CASCADE 추가
-- 경매 삭제 시 연관된 bids, transactions도 함께 삭제

-- bids.auction_id FK 재설정
ALTER TABLE bids DROP CONSTRAINT bids_auction_id_fkey;
ALTER TABLE bids ADD CONSTRAINT bids_auction_id_fkey
  FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE;

-- transactions.auction_id FK 재설정
ALTER TABLE transactions DROP CONSTRAINT transactions_auction_id_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_auction_id_fkey
  FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE;
