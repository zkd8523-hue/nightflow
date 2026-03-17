-- 019: 경매별 대표 이미지 (MD가 직접 설정)
ALTER TABLE auctions ADD COLUMN thumbnail_url TEXT;

-- 경매 템플릿에도 추가
ALTER TABLE auction_templates ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
