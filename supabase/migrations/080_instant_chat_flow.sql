-- Migration 080: 오늘특가 → 당근마켓 스타일 연락 플로우 전환
-- instant 경매: place_bid(즉시 낙찰) → chat_interests(관심 등록) + MD 수동 거래완료
-- auction 경매: 기존 플로우 유지

-- 1. chat_interests 테이블: 유저의 관심 등록 기록
CREATE TABLE chat_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(auction_id, user_id)
);

CREATE INDEX idx_chat_interests_auction ON chat_interests(auction_id);
CREATE INDEX idx_chat_interests_user ON chat_interests(user_id);
ALTER TABLE chat_interests ENABLE ROW LEVEL SECURITY;

-- RLS: 로그인한 유저는 active instant 경매에 관심 등록 가능
CREATE POLICY "Users can insert own interest" ON chat_interests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS: 본인 관심 조회
CREATE POLICY "Users can view own interests" ON chat_interests
  FOR SELECT USING (auth.uid() = user_id);

-- RLS: MD는 본인 경매의 관심자 목록 조회
CREATE POLICY "MD can view interests on own auctions" ON chat_interests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auctions
      WHERE auctions.id = chat_interests.auction_id
      AND auctions.md_id = auth.uid()
    )
  );

-- 2. auctions 테이블에 chat_interest_count 캐시 컬럼 추가
ALTER TABLE auctions ADD COLUMN chat_interest_count INTEGER NOT NULL DEFAULT 0;

-- 3. 카운트 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_chat_interest_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE auctions SET chat_interest_count = chat_interest_count + 1
    WHERE id = NEW.auction_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE auctions SET chat_interest_count = chat_interest_count - 1
    WHERE id = OLD.auction_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_interest_count
  AFTER INSERT OR DELETE ON chat_interests
  FOR EACH ROW EXECUTE FUNCTION update_chat_interest_count();

-- 4. Realtime 활성화 (chat_interest_count 실시간 반영)
ALTER PUBLICATION supabase_realtime ADD TABLE chat_interests;
