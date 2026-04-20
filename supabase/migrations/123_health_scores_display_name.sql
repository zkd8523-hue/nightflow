-- md_health_scores 뷰에 display_name 추가
-- 기존 name만 있으면 "알 수 없음"으로 표시되는 문제 수정

CREATE OR REPLACE VIEW md_health_scores AS
WITH md_auction_stats AS (
  SELECT
    a.md_id,
    COUNT(*) AS total_auctions,
    COUNT(CASE WHEN a.status = 'won' THEN 1 END) AS won_auctions,
    COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) AS cancelled_auctions,
    AVG(CASE WHEN a.status = 'won' AND a.start_price > 0
        THEN a.current_bid::NUMERIC / a.start_price END) AS avg_bid_ratio,
    COUNT(CASE WHEN a.created_at > NOW() - INTERVAL '14 days' THEN 1 END) AS recent_auctions,
    MAX(a.created_at) AS last_auction_date,
    COALESCE(SUM(CASE WHEN a.status = 'won' THEN a.current_bid ELSE 0 END), 0) AS total_won_amount
  FROM auctions a
  WHERE a.created_at > NOW() - INTERVAL '90 days'
  GROUP BY a.md_id
),
md_transaction_stats AS (
  SELECT
    a.md_id,
    COUNT(CASE WHEN t.no_show = true THEN 1 END) AS noshow_count,
    COUNT(CASE WHEN t.confirmed_at IS NOT NULL THEN 1 END) AS confirmed_count,
    COUNT(*) AS total_transactions
  FROM transactions t
  JOIN auctions a ON a.id = t.auction_id
  WHERE t.created_at > NOW() - INTERVAL '90 days'
  GROUP BY a.md_id
),
recent_noshow AS (
  SELECT
    a.md_id,
    COUNT(*) AS noshow_7d
  FROM transactions t
  JOIN auctions a ON a.id = t.auction_id
  WHERE t.no_show = true
    AND t.created_at > NOW() - INTERVAL '7 days'
  GROUP BY a.md_id
)
SELECT
  u.id AS md_id,
  COALESCE(u.display_name, u.name) AS name,
  u.area,
  u.md_status,
  u.instagram,
  u.phone,
  u.created_at AS joined_at,
  COALESCE(mas.total_auctions, 0) AS total_auctions,
  COALESCE(mas.won_auctions, 0) AS won_auctions,
  COALESCE(mas.cancelled_auctions, 0) AS cancelled_auctions,
  COALESCE(mas.recent_auctions, 0) AS recent_auctions_14d,
  mas.last_auction_date,

  CASE WHEN COALESCE(mas.total_auctions, 0) > 0
    THEN ROUND(mas.won_auctions::NUMERIC / mas.total_auctions * 100, 1)
    ELSE 0 END AS sell_through_rate,

  CASE WHEN COALESCE(mas.total_auctions, 0) > 0
    THEN ROUND(mas.cancelled_auctions::NUMERIC / mas.total_auctions * 100, 1)
    ELSE 0 END AS cancel_rate,

  COALESCE(ROUND(mas.avg_bid_ratio * 100, 1), 0) AS avg_bid_ratio_pct,

  COALESCE(mts.noshow_count, 0) AS noshow_count,
  CASE WHEN COALESCE(mas.won_auctions, 0) > 0
    THEN ROUND(COALESCE(mts.noshow_count, 0)::NUMERIC / mas.won_auctions * 100, 1)
    ELSE 0 END AS noshow_rate,

  CASE WHEN COALESCE(mts.total_transactions, 0) > 0
    THEN ROUND(COALESCE(mts.confirmed_count, 0)::NUMERIC / mts.total_transactions * 100, 1)
    ELSE 0 END AS confirm_rate,

  COALESCE(mas.total_won_amount, 0) AS total_won_amount,
  COALESCE(rn.noshow_7d, 0) AS noshow_7d,

  -- Health Score (0-100, 6 indicators)
  CASE WHEN COALESCE(mas.total_auctions, 0) < 5 THEN NULL
  ELSE ROUND((
    LEAST(COALESCE(mas.won_auctions::NUMERIC / NULLIF(mas.total_auctions, 0) / 0.70, 0), 1.0) * 0.25 +
    GREATEST(1.0 - COALESCE(mts.noshow_count::NUMERIC / NULLIF(mas.won_auctions, 0) / 0.15, 0), 0.0) * 0.25 +
    LEAST(COALESCE(mts.confirmed_count::NUMERIC / NULLIF(mts.total_transactions, 0) / 0.80, 0), 1.0) * 0.20 +
    GREATEST(1.0 - COALESCE(mas.cancelled_auctions::NUMERIC / NULLIF(mas.total_auctions, 0) / 0.25, 0), 0.0) * 0.15 +
    LEAST(COALESCE(mas.avg_bid_ratio / 1.50, 0), 1.0) * 0.10 +
    LEAST(COALESCE(mas.recent_auctions, 0) / 5.0, 1.0) * 0.05
  ) * 100, 1) END AS health_score,

  -- Grade
  CASE
    WHEN COALESCE(mas.total_auctions, 0) < 5 THEN 'evaluating'
    WHEN COALESCE(rn.noshow_7d, 0) >= 2 THEN 'F'
    ELSE CASE
      WHEN (
        LEAST(COALESCE(mas.won_auctions::NUMERIC / NULLIF(mas.total_auctions, 0) / 0.70, 0), 1.0) * 0.25 +
        GREATEST(1.0 - COALESCE(mts.noshow_count::NUMERIC / NULLIF(mas.won_auctions, 0) / 0.15, 0), 0.0) * 0.25 +
        LEAST(COALESCE(mts.confirmed_count::NUMERIC / NULLIF(mts.total_transactions, 0) / 0.80, 0), 1.0) * 0.20 +
        GREATEST(1.0 - COALESCE(mas.cancelled_auctions::NUMERIC / NULLIF(mas.total_auctions, 0) / 0.25, 0), 0.0) * 0.15 +
        LEAST(COALESCE(mas.avg_bid_ratio / 1.50, 0), 1.0) * 0.10 +
        LEAST(COALESCE(mas.recent_auctions, 0) / 5.0, 1.0) * 0.05
      ) * 100 >= 90 THEN 'S'
      WHEN (
        LEAST(COALESCE(mas.won_auctions::NUMERIC / NULLIF(mas.total_auctions, 0) / 0.70, 0), 1.0) * 0.25 +
        GREATEST(1.0 - COALESCE(mts.noshow_count::NUMERIC / NULLIF(mas.won_auctions, 0) / 0.15, 0), 0.0) * 0.25 +
        LEAST(COALESCE(mts.confirmed_count::NUMERIC / NULLIF(mts.total_transactions, 0) / 0.80, 0), 1.0) * 0.20 +
        GREATEST(1.0 - COALESCE(mas.cancelled_auctions::NUMERIC / NULLIF(mas.total_auctions, 0) / 0.25, 0), 0.0) * 0.15 +
        LEAST(COALESCE(mas.avg_bid_ratio / 1.50, 0), 1.0) * 0.10 +
        LEAST(COALESCE(mas.recent_auctions, 0) / 5.0, 1.0) * 0.05
      ) * 100 >= 70 THEN 'A'
      WHEN (
        LEAST(COALESCE(mas.won_auctions::NUMERIC / NULLIF(mas.total_auctions, 0) / 0.70, 0), 1.0) * 0.25 +
        GREATEST(1.0 - COALESCE(mts.noshow_count::NUMERIC / NULLIF(mas.won_auctions, 0) / 0.15, 0), 0.0) * 0.25 +
        LEAST(COALESCE(mts.confirmed_count::NUMERIC / NULLIF(mts.total_transactions, 0) / 0.80, 0), 1.0) * 0.20 +
        GREATEST(1.0 - COALESCE(mas.cancelled_auctions::NUMERIC / NULLIF(mas.total_auctions, 0) / 0.25, 0), 0.0) * 0.15 +
        LEAST(COALESCE(mas.avg_bid_ratio / 1.50, 0), 1.0) * 0.10 +
        LEAST(COALESCE(mas.recent_auctions, 0) / 5.0, 1.0) * 0.05
      ) * 100 >= 50 THEN 'B'
      WHEN (
        LEAST(COALESCE(mas.won_auctions::NUMERIC / NULLIF(mas.total_auctions, 0) / 0.70, 0), 1.0) * 0.25 +
        GREATEST(1.0 - COALESCE(mts.noshow_count::NUMERIC / NULLIF(mas.won_auctions, 0) / 0.15, 0), 0.0) * 0.25 +
        LEAST(COALESCE(mts.confirmed_count::NUMERIC / NULLIF(mts.total_transactions, 0) / 0.80, 0), 1.0) * 0.20 +
        GREATEST(1.0 - COALESCE(mas.cancelled_auctions::NUMERIC / NULLIF(mas.total_auctions, 0) / 0.25, 0), 0.0) * 0.15 +
        LEAST(COALESCE(mas.avg_bid_ratio / 1.50, 0), 1.0) * 0.10 +
        LEAST(COALESCE(mas.recent_auctions, 0) / 5.0, 1.0) * 0.05
      ) * 100 >= 30 THEN 'C'
      ELSE 'F'
    END
  END AS grade,

  -- Red Flags
  CASE WHEN COALESCE(rn.noshow_7d, 0) >= 2 THEN true ELSE false END AS flag_consecutive_noshow,
  CASE WHEN mas.last_auction_date IS NULL OR mas.last_auction_date < NOW() - INTERVAL '30 days'
    THEN true ELSE false END AS flag_dormant

FROM users u
LEFT JOIN md_auction_stats mas ON mas.md_id = u.id
LEFT JOIN md_transaction_stats mts ON mts.md_id = u.id
LEFT JOIN recent_noshow rn ON rn.md_id = u.id
WHERE u.role = 'md';
