-- Migration 132: MD의 한마디 필드 추가
-- MD가 경매 카드에 표시할 짧은 프로모션 멘트 (최대 15자, 선택)
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS md_comment VARCHAR(15);
