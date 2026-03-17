-- 057: 경매 입장 시간 필드 추가
-- NULL = 즉시 입장 가능, non-null = 특정 시간 입장 (HH:mm 형식)
ALTER TABLE auctions ADD COLUMN entry_time TEXT;

ALTER TABLE auctions ADD CONSTRAINT check_entry_time_format
  CHECK (entry_time IS NULL OR entry_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
