-- ============================================
-- Smart Pricing: table_info 컬럼 + 가격 추천 RPC
-- ============================================

-- 1. auctions 테이블에 table_info 컬럼 추가
DO $$ BEGIN
  ALTER TABLE auctions ADD COLUMN table_info TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. 기존 데이터 백필: title에서 클럽 이름 제거 후 나머지를 table_info로
UPDATE auctions a
SET table_info = NULLIF(TRIM(REPLACE(a.title, c.name, '')), '')
FROM clubs c
WHERE a.club_id = c.id AND a.table_info IS NULL;

-- 3. 가격 추천 RPC 함수
CREATE OR REPLACE FUNCTION get_price_recommendation(
  p_club_id UUID,
  p_table_info TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_total INTEGER;
  v_successful INTEGER;
  v_fallback BOOLEAN := false;
  v_result JSON;
BEGIN
  -- table_info 필터 포함하여 종료된 경매 수 카운트
  SELECT COUNT(*) INTO v_total
  FROM auctions
  WHERE club_id = p_club_id
    AND status IN ('won', 'paid', 'confirmed', 'unsold')
    AND (p_table_info IS NULL OR table_info = p_table_info);

  -- 3건 미만이고 table_info가 지정된 경우 → 클럽 전체로 폴백
  IF v_total < 3 AND p_table_info IS NOT NULL THEN
    SELECT COUNT(*) INTO v_total
    FROM auctions
    WHERE club_id = p_club_id
      AND status IN ('won', 'paid', 'confirmed', 'unsold');
    v_fallback := true;
  END IF;

  -- 그래도 3건 미만이면 데이터 부족 반환
  IF v_total < 3 THEN
    RETURN json_build_object(
      'sufficient_data', false,
      'total_auctions', v_total,
      'message', '추천 가격을 산출하기 위한 데이터가 부족합니다 (최소 3건 필요)'
    );
  END IF;

  -- 낙찰 성공 건수
  SELECT COUNT(*) INTO v_successful
  FROM auctions
  WHERE club_id = p_club_id
    AND status IN ('won', 'paid', 'confirmed')
    AND (NOT v_fallback AND (p_table_info IS NULL OR table_info = p_table_info)
         OR v_fallback);

  -- CTE로 통계 집계
  WITH all_completed AS (
    SELECT start_price, winning_price, bid_count, status
    FROM auctions
    WHERE club_id = p_club_id
      AND status IN ('won', 'paid', 'confirmed', 'unsold')
      AND (NOT v_fallback AND (p_table_info IS NULL OR table_info = p_table_info)
           OR v_fallback)
  ),
  start_stats AS (
    SELECT
      AVG(start_price) AS avg_start,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY start_price) AS median_start
    FROM all_completed
  ),
  win_stats AS (
    SELECT
      AVG(winning_price) AS avg_win,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY winning_price) AS p25_win,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY winning_price) AS p75_win,
      AVG(bid_count) AS avg_bids
    FROM all_completed
    WHERE status IN ('won', 'paid', 'confirmed') AND winning_price IS NOT NULL
  )
  SELECT json_build_object(
    'sufficient_data', true,
    'fallback', v_fallback,
    'total_auctions', v_total,
    'successful_auctions', v_successful,
    'success_rate', ROUND((v_successful::NUMERIC / NULLIF(v_total, 0)) * 100, 1),
    'suggested_start_price', ROUND(COALESCE(ss.median_start, 0) / 10000) * 10000,
    'avg_winning_price', ROUND(COALESCE(ws.avg_win, 0)),
    'p25_winning_price', ROUND(COALESCE(ws.p25_win, 0)),
    'p75_winning_price', ROUND(COALESCE(ws.p75_win, 0)),
    'avg_bid_count', ROUND(COALESCE(ws.avg_bids, 0), 1)
  ) INTO v_result
  FROM start_stats ss, win_stats ws;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
