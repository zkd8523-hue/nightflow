-- Migration 146: MD 한마디 본문 필드 추가
-- 상세페이지 전용 한마디 (최대 60자, 선택). md_comment(15자, 카드 제목)과 별개.
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS md_message VARCHAR(60);

COMMENT ON COLUMN auctions.md_message IS 'MD가 상세페이지에 노출하는 한마디(본문). 최대 60자.';
