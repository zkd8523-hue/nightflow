-- =============================================================
-- Migration 051: Post-Auction Journey (낙찰 후 여정)
--
-- 새 테이블: auction_reviews, md_unresponsive_reports
-- 새 컬럼: auctions (confirmed_at, cancel_type 등)
-- 새 컬럼: users (md_customer_grade, md_avg_rating 등)
-- 새 뷰: md_customer_grade_scores
-- =============================================================

-- ==================
-- 1. 새 ENUM 타입
-- ==================

DO $$ BEGIN
  CREATE TYPE md_customer_grade_type AS ENUM ('rookie', 'bronze', 'silver', 'gold', 'diamond');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cancellation_type AS ENUM (
    'user_grace',
    'user_late',
    'mutual',
    'noshow_auto',
    'noshow_md'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ==================
-- 2. auctions 컬럼 추가
-- ==================

ALTER TABLE auctions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS cancel_type cancellation_type;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS is_bin_win BOOLEAN DEFAULT false;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS fallback_from_winner_id UUID REFERENCES users(id);
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS feedback_requested_at TIMESTAMPTZ;

-- ==================
-- 3. users MD 등급 컬럼 추가
-- ==================

ALTER TABLE users ADD COLUMN IF NOT EXISTS md_customer_grade md_customer_grade_type DEFAULT 'rookie';
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_avg_rating NUMERIC(3,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_review_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_response_rate NUMERIC(5,2) DEFAULT 100;
ALTER TABLE users ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_reviewer BOOLEAN DEFAULT false;

-- ==================
-- 4. auction_reviews 테이블
-- ==================

CREATE TABLE IF NOT EXISTS auction_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(auction_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_auction_reviews_md ON auction_reviews(md_id);
CREATE INDEX IF NOT EXISTS idx_auction_reviews_user ON auction_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_auction_reviews_auction ON auction_reviews(auction_id);

ALTER TABLE auction_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own reviews" ON auction_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own reviews" ON auction_reviews
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = md_id);

CREATE POLICY "Admins can read all reviews" ON auction_reviews
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================
-- 5. md_unresponsive_reports 테이블
-- ==================

CREATE TABLE IF NOT EXISTS md_unresponsive_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  UNIQUE(auction_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_md_unresponsive_md ON md_unresponsive_reports(md_id);

ALTER TABLE md_unresponsive_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own reports" ON md_unresponsive_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can read own reports" ON md_unresponsive_reports
  FOR SELECT USING (auth.uid() = reporter_id OR auth.uid() = md_id);

CREATE POLICY "Admins can manage all reports" ON md_unresponsive_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================
-- 6. MD 고객 등급 산출 뷰 (90일 rolling)
-- ==================

CREATE OR REPLACE VIEW md_customer_grade_scores AS
WITH review_stats AS (
  SELECT md_id, COUNT(*) AS review_count, ROUND(AVG(rating), 2) AS avg_rating
  FROM auction_reviews
  WHERE created_at > NOW() - INTERVAL '90 days'
  GROUP BY md_id
),
auction_stats AS (
  SELECT md_id,
    COUNT(CASE WHEN status IN ('won', 'confirmed') THEN 1 END) AS completed_auctions,
    COUNT(CASE WHEN status = 'cancelled' AND cancel_type = 'noshow_auto' THEN 1 END) AS noshow_auctions
  FROM auctions
  WHERE created_at > NOW() - INTERVAL '90 days'
  GROUP BY md_id
),
report_stats AS (
  SELECT md_id, COUNT(*) AS unresponsive_count
  FROM md_unresponsive_reports
  WHERE reported_at > NOW() - INTERVAL '90 days'
  GROUP BY md_id
)
SELECT
  u.id AS md_id, u.name, u.area,
  COALESCE(rs.avg_rating, 0) AS avg_rating,
  COALESCE(rs.review_count, 0) AS review_count,
  COALESCE(ast.completed_auctions, 0) AS completed_auctions,
  COALESCE(ast.noshow_auctions, 0) AS noshow_auctions,
  CASE WHEN COALESCE(ast.completed_auctions, 0) > 0
    THEN ROUND(ast.noshow_auctions::NUMERIC / ast.completed_auctions * 100, 1)
    ELSE 0 END AS noshow_rate,
  CASE WHEN COALESCE(ast.completed_auctions, 0) > 0
    THEN GREATEST(0, ROUND(100 - (COALESCE(rpt.unresponsive_count, 0)::NUMERIC / ast.completed_auctions * 100), 1))
    ELSE 100 END AS response_rate,
  CASE
    WHEN COALESCE(ast.completed_auctions, 0) < 5 THEN 'rookie'::md_customer_grade_type
    WHEN COALESCE(rs.avg_rating, 0) >= 4.5 AND COALESCE(ast.completed_auctions, 0) >= 50
         AND (COALESCE(ast.noshow_auctions, 0)::NUMERIC / NULLIF(ast.completed_auctions, 0) * 100) <= 5
    THEN 'diamond'::md_customer_grade_type
    WHEN COALESCE(rs.avg_rating, 0) >= 4.0 AND COALESCE(ast.completed_auctions, 0) >= 30
    THEN 'gold'::md_customer_grade_type
    WHEN COALESCE(rs.avg_rating, 0) >= 3.5 AND COALESCE(ast.completed_auctions, 0) >= 15
    THEN 'silver'::md_customer_grade_type
    WHEN COALESCE(rs.avg_rating, 0) >= 3.0 AND COALESCE(ast.completed_auctions, 0) >= 5
    THEN 'bronze'::md_customer_grade_type
    ELSE 'rookie'::md_customer_grade_type
  END AS calculated_grade
FROM users u
LEFT JOIN review_stats rs ON rs.md_id = u.id
LEFT JOIN auction_stats ast ON ast.md_id = u.id
LEFT JOIN report_stats rpt ON rpt.md_id = u.id
WHERE u.role = 'md';

-- ==================
-- 7. 트리거: 리뷰 → MD 캐시 업데이트
-- ==================

CREATE OR REPLACE FUNCTION update_md_review_cache()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET
    md_avg_rating = (SELECT COALESCE(AVG(rating), 0) FROM auction_reviews WHERE md_id = NEW.md_id),
    md_review_count = (SELECT COUNT(*) FROM auction_reviews WHERE md_id = NEW.md_id)
  WHERE id = NEW.md_id;

  UPDATE users SET
    review_count = (SELECT COUNT(*) FROM auction_reviews WHERE user_id = NEW.user_id),
    is_reviewer = true
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_md_review_cache ON auction_reviews;
CREATE TRIGGER trg_update_md_review_cache
  AFTER INSERT ON auction_reviews
  FOR EACH ROW EXECUTE FUNCTION update_md_review_cache();

-- ==================
-- 8. 트리거: confirmed 시 confirmed_at 자동 설정
-- ==================

CREATE OR REPLACE FUNCTION set_confirmed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    NEW.confirmed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_confirmed_at ON auctions;
CREATE TRIGGER trg_set_confirmed_at
  BEFORE UPDATE ON auctions
  FOR EACH ROW EXECUTE FUNCTION set_confirmed_at();

-- ==================
-- 9. 인덱스
-- ==================

CREATE INDEX IF NOT EXISTS idx_auctions_feedback_pending
  ON auctions(status, confirmed_at)
  WHERE status = 'confirmed' AND feedback_requested_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auctions_cancel_type ON auctions(cancel_type) WHERE cancel_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_md_customer_grade ON users(md_customer_grade) WHERE role = 'md';

-- ==================
-- 10. notification enum 확장
-- ==================

DO $$ BEGIN ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'feedback_request'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'md_grade_change'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'md_unresponsive_alert'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'cancellation_confirmed'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE in_app_notification_type ADD VALUE IF NOT EXISTS 'feedback_request'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE in_app_notification_type ADD VALUE IF NOT EXISTS 'md_grade_change'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE in_app_notification_type ADD VALUE IF NOT EXISTS 'cancellation_confirmed'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
