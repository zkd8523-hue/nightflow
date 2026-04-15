-- ============================================================================
-- Migration 103: 퍼즐 PMF 애널리틱스 뷰
-- 날짜: 2026-04-15
-- 설명: 퍼즐 기능의 PMF 증명을 위한 5개 분석 뷰
--       OMTM: Puzzle-to-Visit Rate (퍼즐 → 방문 전환율)
--       보조: Fill Rate, Time to First Offer, 지역별 수급, MD 성과, 리텐션
-- ============================================================================

-- ============================================================================
-- 1. puzzle_daily_funnel — 일간 퍼널 스냅샷
--    OMTM(Puzzle-to-Visit Rate) + Fill Rate 자동 계산
-- ============================================================================
CREATE OR REPLACE VIEW puzzle_daily_funnel AS
WITH daily AS (
  SELECT
    DATE(created_at) AS dt,
    COUNT(*) AS puzzles_created,
    COUNT(*) FILTER (WHERE status != 'cancelled') AS puzzles_active,
    COUNT(*) FILTER (WHERE status IN ('accepted', 'matched')) AS puzzles_accepted,
    COUNT(*) FILTER (WHERE status = 'matched') AS puzzles_matched
  FROM puzzles
  GROUP BY DATE(created_at)
),
offers AS (
  SELECT
    DATE(p.created_at) AS dt,
    COUNT(DISTINCT CASE WHEN po.id IS NOT NULL THEN p.id END) AS puzzles_with_offers,
    COUNT(po.id) AS total_offers
  FROM puzzles p
  LEFT JOIN puzzle_offers po ON po.puzzle_id = p.id
  WHERE p.status != 'cancelled'
  GROUP BY DATE(p.created_at)
)
SELECT
  d.dt,
  d.puzzles_created,
  d.puzzles_active,
  COALESCE(o.puzzles_with_offers, 0) AS puzzles_with_offers,
  ROUND(
    COALESCE(o.puzzles_with_offers, 0)::NUMERIC
    / NULLIF(d.puzzles_active, 0) * 100, 1
  ) AS fill_rate_pct,
  COALESCE(o.total_offers, 0) AS total_offers,
  ROUND(
    COALESCE(o.total_offers, 0)::NUMERIC
    / NULLIF(COALESCE(o.puzzles_with_offers, 0), 0), 1
  ) AS avg_offers_per_filled,
  d.puzzles_accepted,
  d.puzzles_matched,
  ROUND(
    d.puzzles_matched::NUMERIC
    / NULLIF(d.puzzles_active, 0) * 100, 1
  ) AS puzzle_to_visit_rate_pct
FROM daily d
LEFT JOIN offers o ON o.dt = d.dt
ORDER BY d.dt DESC;

-- ============================================================================
-- 2. puzzle_time_to_first_offer — 최초 오퍼 수신 시간
--    유저 경험 품질 선행 지표
-- ============================================================================
CREATE OR REPLACE VIEW puzzle_time_to_first_offer AS
SELECT
  p.id AS puzzle_id,
  p.area,
  p.event_date,
  p.created_at AS puzzle_created_at,
  MIN(po.created_at) AS first_offer_at,
  ROUND(
    EXTRACT(EPOCH FROM (MIN(po.created_at) - p.created_at)) / 3600, 1
  ) AS hours_to_first_offer
FROM puzzles p
LEFT JOIN puzzle_offers po ON po.puzzle_id = p.id
WHERE p.status != 'cancelled'
GROUP BY p.id, p.area, p.event_date, p.created_at;

-- ============================================================================
-- 3. puzzle_supply_demand_by_area — 지역별 수급 균형
--    공급 병목 진단의 핵심 (세그먼트별 Fill Rate)
-- ============================================================================
CREATE OR REPLACE VIEW puzzle_supply_demand_by_area AS
SELECT
  p.area,
  DATE_TRUNC('week', p.created_at)::DATE AS week_start,
  COUNT(DISTINCT p.id) AS puzzles_count,
  COUNT(DISTINCT po.md_id) AS active_mds,
  COUNT(po.id) AS total_offers,
  COUNT(DISTINCT CASE WHEN po.id IS NOT NULL THEN p.id END) AS puzzles_with_offers,
  ROUND(
    COUNT(DISTINCT CASE WHEN po.id IS NOT NULL THEN p.id END)::NUMERIC
    / NULLIF(COUNT(DISTINCT p.id), 0) * 100, 1
  ) AS fill_rate_pct,
  ROUND(
    COUNT(po.id)::NUMERIC / NULLIF(COUNT(DISTINCT p.id), 0), 1
  ) AS offers_per_puzzle
FROM puzzles p
LEFT JOIN puzzle_offers po ON po.puzzle_id = p.id
WHERE p.status != 'cancelled'
GROUP BY p.area, DATE_TRUNC('week', p.created_at)
ORDER BY week_start DESC, area;

-- ============================================================================
-- 4. md_puzzle_performance — MD 성과 리더보드
--    오퍼 품질(수락률) 추적
-- ============================================================================
CREATE OR REPLACE VIEW md_puzzle_performance AS
SELECT
  po.md_id,
  u.name AS md_name,
  u.area AS md_area,
  COUNT(po.id) AS total_offers_sent,
  COUNT(po.id) FILTER (WHERE po.status = 'accepted') AS offers_accepted,
  ROUND(
    COUNT(po.id) FILTER (WHERE po.status = 'accepted')::NUMERIC
    / NULLIF(COUNT(po.id), 0) * 100, 1
  ) AS acceptance_rate_pct,
  ROUND(AVG(po.proposed_price)) AS avg_proposed_price,
  COUNT(po.id) FILTER (WHERE po.status = 'accepted') * 30 AS credits_spent
FROM puzzle_offers po
JOIN users u ON u.id = po.md_id
GROUP BY po.md_id, u.name, u.area
ORDER BY offers_accepted DESC;

-- ============================================================================
-- 5. puzzle_leader_retention — 유저 재사용률
--    가장 강력한 PMF 신호
-- ============================================================================
CREATE OR REPLACE VIEW puzzle_leader_retention AS
SELECT
  leader_id,
  COUNT(*) AS total_puzzles,
  COUNT(*) FILTER (WHERE status = 'matched') AS matched_puzzles,
  COUNT(*) FILTER (WHERE status IN ('accepted', 'matched')) AS accepted_puzzles,
  MIN(created_at) AS first_puzzle_at,
  MAX(created_at) AS last_puzzle_at,
  CASE WHEN COUNT(*) >= 2 THEN true ELSE false END AS is_repeat_leader
FROM puzzles
WHERE status != 'cancelled'
GROUP BY leader_id;
