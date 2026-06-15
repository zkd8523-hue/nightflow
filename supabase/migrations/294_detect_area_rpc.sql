-- Migration 294: GPS 좌표 → 지역 코드 판정 RPC
-- - 정적 영역 (강남/홍대/이태원 중심점 ± 반경) 우선 체크
-- - 정적 영역 밖이면 같은 area로 분류된 클럽들의 좌표 ± 300m 안인지 체크
-- - 신규 클럽 추가/이동 시 자동 반영 (별도 마이그레이션 불필요)

-- ============================================
-- Haversine 거리 (km)
-- ============================================
CREATE OR REPLACE FUNCTION haversine_km(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE SQL IMMUTABLE
AS $$
  SELECT 2 * 6371 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2 +
      cos(radians(lat1)) * cos(radians(lat2)) *
      sin(radians(lng2 - lng1) / 2) ^ 2
    )
  );
$$;

-- ============================================
-- 좌표 → 지역 코드 (강남/홍대/이태원/NULL)
-- ============================================
CREATE OR REPLACE FUNCTION detect_chat_area(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_static_areas CONSTANT JSONB := '[
    {"code": "gangnam", "name": "강남", "lat": 37.4979, "lng": 127.0276, "radius_km": 1.5},
    {"code": "hongdae", "name": "홍대", "lat": 37.5563, "lng": 126.9236, "radius_km": 1.5},
    {"code": "itaewon", "name": "이태원", "lat": 37.5340, "lng": 126.9944, "radius_km": 1.2}
  ]'::JSONB;
  v_area JSONB;
  v_club_radius_km CONSTANT DOUBLE PRECISION := 0.3; -- 클럽 주변 300m
  v_matched_area TEXT;
BEGIN
  -- 1단계: 정적 중심 반경 안인지
  FOR v_area IN SELECT * FROM jsonb_array_elements(v_static_areas) LOOP
    IF haversine_km(
      p_lat, p_lng,
      (v_area->>'lat')::DOUBLE PRECISION,
      (v_area->>'lng')::DOUBLE PRECISION
    ) <= (v_area->>'radius_km')::DOUBLE PRECISION THEN
      RETURN v_area->>'code';
    END IF;
  END LOOP;

  -- 2단계: 정적 영역 밖이면, area가 강남/홍대/이태원으로 분류된 클럽 좌표 ± 300m 안인지
  SELECT
    CASE
      WHEN area = '강남' THEN 'gangnam'
      WHEN area = '홍대' THEN 'hongdae'
      WHEN area = '이태원' THEN 'itaewon'
      ELSE NULL
    END
    INTO v_matched_area
  FROM clubs
  WHERE area IN ('강남', '홍대', '이태원')
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND deleted_at IS NULL
    AND haversine_km(p_lat, p_lng, latitude, longitude) <= v_club_radius_km
  LIMIT 1;

  RETURN v_matched_area; -- 매칭 없으면 NULL
END;
$$;

GRANT EXECUTE ON FUNCTION detect_chat_area(DOUBLE PRECISION, DOUBLE PRECISION)
  TO anon, authenticated;

COMMENT ON FUNCTION detect_chat_area IS
  '와글 GPS 인증: 정적 영역(강남/홍대/이태원 중심±1.2-1.5km) → 클럽 좌표±300m → NULL. 신규 클럽 추가 시 자동 반영.';
