-- NightFlow MVP: 초기 스키마
-- 테이블: users, clubs, auctions, bids, transactions

-- ================================
-- 1. USERS (유저 통합 테이블)
-- ================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'md', 'admin')),
  kakao_id TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  profile_image TEXT,

  -- MD 전용 필드
  md_status TEXT CHECK (md_status IN ('pending', 'approved', 'rejected')),
  md_unique_slug TEXT UNIQUE,
  bank_account TEXT,
  bank_name TEXT,

  -- 노쇼/제재
  noshow_count INTEGER NOT NULL DEFAULT 0,
  no_pay_count INTEGER NOT NULL DEFAULT 0,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  blocked_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- 2. CLUBS (클럽 정보)
-- ================================
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  area TEXT NOT NULL CHECK (area IN ('강남', '홍대', '이태원')),
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- 3. AUCTIONS (경매)
-- ================================
CREATE TABLE auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),

  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  table_type TEXT NOT NULL CHECK (table_type IN ('Standard', 'VIP', 'Premium')),
  min_people INTEGER NOT NULL,
  max_people INTEGER NOT NULL,
  includes TEXT[] DEFAULT '{}',
  notes TEXT,

  -- 가격
  original_price INTEGER NOT NULL,
  start_price INTEGER NOT NULL,
  reserve_price INTEGER NOT NULL,
  current_bid INTEGER NOT NULL DEFAULT 0,
  bid_increment INTEGER NOT NULL DEFAULT 10000,

  -- 경매 상태
  bid_count INTEGER NOT NULL DEFAULT 0,
  bidder_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('draft', 'scheduled', 'active', 'won', 'unsold', 'paid', 'confirmed', 'cancelled', 'expired')),

  -- 시간
  auction_start_at TIMESTAMPTZ NOT NULL,
  auction_end_at TIMESTAMPTZ NOT NULL,
  extended_end_at TIMESTAMPTZ,
  auto_extend_min INTEGER NOT NULL DEFAULT 5,
  duration_minutes INTEGER NOT NULL,

  -- 낙찰 정보
  winner_id UUID REFERENCES users(id),
  winning_price INTEGER,
  won_at TIMESTAMPTZ,
  payment_deadline TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- 4. BIDS (입찰 기록)
-- ================================
CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id),
  bidder_id UUID NOT NULL REFERENCES users(id),

  bid_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'outbid', 'won', 'cancelled')),

  bid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- 5. TRANSACTIONS (거래/결제)
-- ================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id),
  buyer_id UUID NOT NULL REFERENCES users(id),
  md_id UUID NOT NULL REFERENCES users(id),

  winning_price INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  md_commission_rate DECIMAL NOT NULL DEFAULT 10.00,
  md_commission_amt INTEGER NOT NULL,

  payment_key TEXT,
  payment_method TEXT CHECK (payment_method IN ('card', 'kakao_pay', 'toss_pay')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired', 'refunded')),

  reservation_code VARCHAR(8) UNIQUE,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id),

  referrer_md_id UUID REFERENCES users(id),

  -- 환불
  refund_reason TEXT,
  refund_amount INTEGER,
  refund_status TEXT NOT NULL DEFAULT 'none'
    CHECK (refund_status IN ('none', 'requested', 'completed')),

  -- 노쇼
  no_show BOOLEAN NOT NULL DEFAULT false,

  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- 6. 인덱스
-- ================================
CREATE INDEX idx_auctions_status ON auctions(status);
CREATE INDEX idx_auctions_event_date ON auctions(event_date);
CREATE INDEX idx_auctions_club ON auctions(club_id);
CREATE INDEX idx_auctions_md ON auctions(md_id);
CREATE INDEX idx_bids_auction ON bids(auction_id, bid_amount DESC);
CREATE INDEX idx_bids_bidder ON bids(bidder_id);
CREATE INDEX idx_transactions_buyer ON transactions(buyer_id);
CREATE INDEX idx_transactions_auction ON transactions(auction_id);
CREATE INDEX idx_users_kakao ON users(kakao_id);
CREATE INDEX idx_users_slug ON users(md_unique_slug);

-- ================================
-- 7. Realtime 활성화
-- ================================
ALTER PUBLICATION supabase_realtime ADD TABLE auctions;
ALTER PUBLICATION supabase_realtime ADD TABLE bids;

-- ================================
-- 8. RLS (Row Level Security) 활성화
-- ================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Users: 본인 프로필 읽기/수정, 모든 유저 이름/프로필 읽기
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public user profiles" ON users
  FOR SELECT USING (true);

-- Clubs: 누구나 읽기 가능
CREATE POLICY "Anyone can read clubs" ON clubs
  FOR SELECT USING (true);

-- Auctions: 누구나 읽기, MD만 생성/수정
CREATE POLICY "Anyone can read auctions" ON auctions
  FOR SELECT USING (true);

CREATE POLICY "MD can create auctions" ON auctions
  FOR INSERT WITH CHECK (
    auth.uid() = md_id
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'md' AND md_status = 'approved')
  );

CREATE POLICY "MD can update own auctions" ON auctions
  FOR UPDATE USING (auth.uid() = md_id);

CREATE POLICY "MD can delete own auctions" ON auctions
  FOR DELETE USING (auth.uid() = md_id);

-- Bids: 누구나 읽기, 로그인 유저만 생성
CREATE POLICY "Anyone can read bids" ON bids
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can bid" ON bids
  FOR INSERT WITH CHECK (auth.uid() = bidder_id);

-- Transactions: 본인 거래만 읽기
CREATE POLICY "Users can read own transactions" ON transactions
  FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = md_id);

-- ================================
-- 9. updated_at 자동 갱신 트리거
-- ================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER auctions_updated_at
  BEFORE UPDATE ON auctions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
