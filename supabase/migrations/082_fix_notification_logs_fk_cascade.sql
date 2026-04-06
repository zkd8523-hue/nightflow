-- notification_logs.auction_id FK에 ON DELETE CASCADE 추가
-- 경매 삭제 시 관련 알림 로그도 자동 삭제
ALTER TABLE notification_logs
  DROP CONSTRAINT notification_logs_auction_id_fkey;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_auction_id_fkey
  FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE;
