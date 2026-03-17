-- 020: effective_end_at 생성 컬럼 추가
-- 목적: close-expired-auctions Edge Function에서 COALESCE를 PostgREST 필터로 사용 불가 문제 해결
-- COALESCE(extended_end_at, auction_end_at)를 stored generated column으로 대체

ALTER TABLE auctions ADD COLUMN effective_end_at TIMESTAMPTZ
  GENERATED ALWAYS AS (COALESCE(extended_end_at, auction_end_at)) STORED;

CREATE INDEX idx_auctions_effective_end ON auctions(effective_end_at) WHERE status = 'active';
