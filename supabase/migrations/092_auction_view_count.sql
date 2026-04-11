-- ============================================
-- 092: 실시간 조회수 (Auction View Count)
-- 목적: MD에게 수요 가시성 제공, 유저에게 FOMO 강화
-- ============================================

-- 1. 조회 추적 테이블
CREATE TABLE IF NOT EXISTS auction_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(auction_id, user_id)  -- 유저당 1회만 카운트
);

CREATE INDEX idx_auction_views_auction ON auction_views(auction_id);
CREATE INDEX idx_auction_views_user ON auction_views(user_id);
ALTER TABLE auction_views ENABLE ROW LEVEL SECURITY;

-- 2. RLS 정책
CREATE POLICY "Users can insert own view" ON auction_views
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own views" ON auction_views
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "MD can view views on own auctions" ON auction_views
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auctions
      WHERE auctions.id = auction_views.auction_id
      AND auctions.md_id = auth.uid()
    )
  );

-- 3. auctions 테이블에 캐시 컬럼 추가
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

-- 4. 트리거: auction_views INSERT 시 auctions.view_count 자동 증가
CREATE OR REPLACE FUNCTION update_auction_view_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE auctions SET view_count = view_count + 1
    WHERE id = NEW.auction_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE auctions SET view_count = GREATEST(view_count - 1, 0)
    WHERE id = OLD.auction_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auction_view_count
  AFTER INSERT OR DELETE ON auction_views
  FOR EACH ROW EXECUTE FUNCTION update_auction_view_count();
