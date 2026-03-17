-- ================================
-- 1. AUCTION_TEMPLATES 테이블 duration_minutes 기본값 변경
-- ================================
ALTER TABLE auction_templates
ALTER COLUMN duration_minutes SET DEFAULT 15;
