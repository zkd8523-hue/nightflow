-- 당일 깃발 오퍼 속도 분석 RPC
-- "당일 깃발" = event_date(KST) = created_at(KST)::date
-- 윈도우: 깃발 생성 후 3시간 내 들어온 오퍼 (또는 offer_deadline 중 더 빠른 쪽)
-- 표본: 생성 후 3시간이 이미 지난 깃발만 (live 깃발 편향 제거)

CREATE OR REPLACE FUNCTION get_today_puzzle_velocity()
RETURNS TABLE(
  sample_size BIGINT,
  avg_first_offer_minutes NUMERIC,
  median_first_offer_minutes NUMERIC,
  avg_offers_3h NUMERIC,
  offered_ratio NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH same_day_puzzles AS (
    SELECT
      p.id,
      p.created_at,
      LEAST(p.created_at + interval '3 hours', p.offer_deadline) AS window_end
    FROM puzzles p
    JOIN users u ON u.id = p.leader_id
    WHERE p.created_at >= now() - interval '14 days'
      AND p.created_at <= now() - interval '3 hours'  -- 3시간 경과 깃발만
      AND p.status <> 'cancelled'
      AND COALESCE(u.is_test, false) = false
      AND p.event_date = (p.created_at AT TIME ZONE 'Asia/Seoul')::date
      AND p.offer_deadline > p.created_at
  ),
  per_puzzle AS (
    SELECT
      sp.id,
      MIN(EXTRACT(EPOCH FROM (po.created_at - sp.created_at))/60)
        FILTER (WHERE po.created_at <= sp.window_end) AS first_offer_min,
      COUNT(po.id) FILTER (WHERE po.created_at <= sp.window_end) AS offers_in_window
    FROM same_day_puzzles sp
    LEFT JOIN puzzle_offers po ON po.puzzle_id = sp.id
    GROUP BY sp.id
  )
  SELECT
    COUNT(*)::BIGINT AS sample_size,
    ROUND(AVG(first_offer_min)::NUMERIC, 1) AS avg_first_offer_minutes,
    ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY first_offer_min))::NUMERIC, 1)
      AS median_first_offer_minutes,
    ROUND(AVG(offers_in_window)::NUMERIC, 1) AS avg_offers_3h,
    ROUND(
      (COUNT(*) FILTER (WHERE offers_in_window > 0))::NUMERIC
        / NULLIF(COUNT(*), 0), 3
    ) AS offered_ratio
  FROM per_puzzle;
$$;

GRANT EXECUTE ON FUNCTION get_today_puzzle_velocity() TO anon, authenticated;
