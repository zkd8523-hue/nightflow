-- ============================================================================
-- Migration 115: user_trust_scores VIEW에서 실명 → display_name 전환
-- 날짜: 2026-04-17
-- 설명: MD가 유저 실명(name)이 아닌 닉네임(display_name)만 보도록 변경.
--       Model B에서 MD→유저 실명 접근 불필요 (유저가 MD에게 연락하는 구조).
-- ============================================================================

CREATE OR REPLACE VIEW user_trust_scores AS
SELECT
  u.id,
  u.display_name,
  u.profile_image,
  u.noshow_count,
  u.is_blocked,
  u.strike_count,
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
  COUNT(DISTINCT CASE WHEN a.status = 'confirmed' THEN a.id END) AS confirmed_visits,
  CASE
    WHEN u.strike_count >= 3 OR u.is_blocked THEN 'blocked'
    WHEN u.strike_count >= 1 THEN 'caution'
    WHEN COUNT(DISTINCT CASE WHEN b.status = 'won' THEN b.id END) >= 5
         AND u.strike_count = 0
    THEN 'vip'
    ELSE 'normal'
  END AS trust_level
FROM users u
LEFT JOIN bids b ON b.bidder_id = u.id
LEFT JOIN auctions a ON a.winner_id = u.id AND a.status IN ('won', 'contacted', 'confirmed')
WHERE u.role = 'user'
GROUP BY u.id, u.display_name, u.profile_image, u.noshow_count, u.is_blocked, u.strike_count;
