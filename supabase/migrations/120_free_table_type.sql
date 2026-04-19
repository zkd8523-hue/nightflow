-- Migration 120: table_type CHECK 제약 제거 (자유 입력 허용)
-- 기존: Standard/VIP/Premium 고정 → 이후: 일반석/VIP + 직접 입력

ALTER TABLE puzzle_offers DROP CONSTRAINT IF EXISTS puzzle_offers_table_type_check;
ALTER TABLE auctions DROP CONSTRAINT IF EXISTS auctions_table_type_check;
