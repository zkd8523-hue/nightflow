-- 판매 경로 수집: nightflow / other
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS sale_channel TEXT CHECK (sale_channel IN ('nightflow', 'other'));
