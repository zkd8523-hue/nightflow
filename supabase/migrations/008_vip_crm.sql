-- ================================
-- 1. MD-유저 VIP 관계 테이블
-- ================================
CREATE TABLE md_vip_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT,  -- MD 메모 (예: "단골 A씨, 매주 금요일")
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(md_id, user_id)
);

CREATE INDEX idx_vip_md ON md_vip_users(md_id);
CREATE INDEX idx_vip_user ON md_vip_users(user_id);

-- RLS 활성화
ALTER TABLE md_vip_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MD can manage own VIP list" ON md_vip_users
  FOR ALL USING (auth.uid() = md_id);

-- ================================
-- 2. 유저 신뢰도 산출 뷰 (user_trust_scores)
-- ================================
CREATE OR REPLACE VIEW user_trust_scores AS
SELECT
  u.id,
  u.name,
  u.profile_image,
  u.noshow_count,
  u.is_blocked,
  COUNT(DISTINCT b.id) AS total_bids,
  COUNT(DISTINCT CASE WHEN b.status = 'won' THEN b.id END) AS won_bids,
  ROUND(
    COALESCE(
      COUNT(DISTINCT CASE WHEN b.status = 'won' THEN b.id END)::NUMERIC /
      NULLIF(COUNT(DISTINCT b.id), 0) * 100,
      0
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
