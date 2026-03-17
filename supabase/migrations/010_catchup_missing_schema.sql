-- ============================================
-- Catch-up migration: 003-008에서 누락된 스키마 적용
-- 마이그레이션 히스토리에는 "applied"로 표시됐지만
-- 실제로 실행되지 않았던 변경사항들
-- ============================================

-- ============================================
-- FROM 003: clubs 테이블 컬럼 추가
-- ============================================
DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN md_id UUID REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN latitude DECIMAL(10, 8);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN longitude DECIMAL(11, 8);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN address_detail TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN postal_code TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN phone TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_clubs_md_id ON clubs(md_id);
CREATE INDEX IF NOT EXISTS idx_clubs_coordinates ON clubs(latitude, longitude);

-- RLS 정책 (안전하게 재생성)
DROP POLICY IF EXISTS "Anyone can read clubs" ON clubs;
CREATE POLICY "Anyone can read clubs" ON clubs FOR SELECT USING (true);

DROP POLICY IF EXISTS "MD can create own clubs" ON clubs;
DROP POLICY IF EXISTS "MD can update own clubs" ON clubs;
DROP POLICY IF EXISTS "MD can delete own clubs" ON clubs;

-- ============================================
-- FROM 004: CASCADE DELETE 추가
-- ============================================
DO $$ BEGIN
  ALTER TABLE bids DROP CONSTRAINT IF EXISTS bids_auction_id_fkey;
  ALTER TABLE bids ADD CONSTRAINT bids_auction_id_fkey
    FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_auction_id_fkey;
  ALTER TABLE transactions ADD CONSTRAINT transactions_auction_id_fkey
    FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================
-- FROM 005: auction_templates 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS auction_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  table_type TEXT CHECK (table_type IN ('Standard', 'VIP', 'Premium')),
  min_people INTEGER,
  max_people INTEGER,
  original_price INTEGER,
  start_price INTEGER,
  includes TEXT[] DEFAULT '{}',
  duration_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_md ON auction_templates(md_id);
ALTER TABLE auction_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MD can manage own templates" ON auction_templates;
CREATE POLICY "MD can manage own templates" ON auction_templates
  FOR ALL USING (auth.uid() = md_id);

CREATE OR REPLACE FUNCTION check_template_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM auction_templates WHERE md_id = NEW.md_id) >= 10 THEN
    RAISE EXCEPTION '템플릿은 최대 10개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_template_limit ON auction_templates;
CREATE TRIGGER enforce_template_limit
  BEFORE INSERT ON auction_templates
  FOR EACH ROW EXECUTE FUNCTION check_template_limit();

DROP TRIGGER IF EXISTS auction_templates_updated_at ON auction_templates;
CREATE TRIGGER auction_templates_updated_at
  BEFORE UPDATE ON auction_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FROM 006: Admin-only clubs 정책
-- ============================================
DROP POLICY IF EXISTS "MD can manage own clubs" ON clubs;
DROP POLICY IF EXISTS "MD can create clubs" ON clubs;

DROP POLICY IF EXISTS "Admins can insert clubs" ON clubs;
CREATE POLICY "Admins can insert clubs" ON clubs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update clubs" ON clubs;
CREATE POLICY "Admins can update clubs" ON clubs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete clubs" ON clubs;
CREATE POLICY "Admins can delete clubs" ON clubs FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- FROM 007: buy_now_price 컬럼
-- ============================================
DO $$ BEGIN
  ALTER TABLE auctions ADD COLUMN buy_now_price INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE auctions ADD CONSTRAINT check_bin_price
    CHECK (buy_now_price IS NULL OR buy_now_price >= start_price * 1.5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- FROM 008: VIP CRM
-- ============================================
CREATE TABLE IF NOT EXISTS md_vip_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(md_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vip_md ON md_vip_users(md_id);
CREATE INDEX IF NOT EXISTS idx_vip_user ON md_vip_users(user_id);

ALTER TABLE md_vip_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MD can manage own VIP list" ON md_vip_users;
CREATE POLICY "MD can manage own VIP list" ON md_vip_users
  FOR ALL USING (auth.uid() = md_id);

CREATE OR REPLACE VIEW user_trust_scores AS
SELECT
  u.id, u.name, u.profile_image, u.noshow_count, u.is_blocked,
  COUNT(DISTINCT b.id) AS total_bids,
  COUNT(DISTINCT CASE WHEN b.status = 'won' THEN b.id END) AS won_bids,
  ROUND(
    COALESCE(
      COUNT(DISTINCT CASE WHEN b.status = 'won' THEN b.id END)::NUMERIC /
      NULLIF(COUNT(DISTINCT b.id), 0) * 100, 0
    ), 1
  ) AS win_rate,
  COALESCE(ROUND(AVG(b.bid_amount)), 0) AS avg_bid_amount,
  COUNT(DISTINCT CASE WHEN t.no_show = true THEN t.id END) AS noshow_from_transactions,
  COUNT(DISTINCT CASE WHEN t.confirmed_at IS NOT NULL THEN t.id END) AS confirmed_visits,
  CASE
    WHEN u.noshow_count >= 3 THEN 'blocked'
    WHEN u.noshow_count >= 1 THEN 'caution'
    WHEN COUNT(DISTINCT CASE WHEN b.status = 'won' THEN b.id END) >= 5
         AND COUNT(DISTINCT CASE WHEN t.no_show = true THEN t.id END) = 0
    THEN 'vip'
    ELSE 'normal'
  END AS trust_level
FROM users u
LEFT JOIN bids b ON b.bidder_id = u.id
LEFT JOIN transactions t ON t.buyer_id = u.id
WHERE u.role = 'user'
GROUP BY u.id, u.name, u.profile_image, u.noshow_count, u.is_blocked;
