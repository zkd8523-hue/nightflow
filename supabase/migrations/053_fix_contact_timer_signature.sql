-- Migration 053: calculate_contact_timer(UUID) 함수 시그니처 수정
-- 날짜: 2026-03-10
-- 문제: Migration 052에서 calculate_contact_timer()를 파라미터 없는 버전으로 재정의했으나,
--       Migration 030의 UUID 파라미터 버전이 여전히 존재.
--       close_auction()과 place_bid()가 UUID 버전을 호출 → pass_expires_at 컬럼 참조 에러.

-- ============================================================
-- 1. UUID 파라미터 버전 재정의 (pass_expires_at 참조 제거)
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_contact_timer(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  v_dow INTEGER;
  v_hour INTEGER;
  v_base INTEGER;
BEGIN
  v_dow := EXTRACT(DOW FROM now());
  v_hour := EXTRACT(HOUR FROM now());

  -- 피크타임 (금/토 22:00~02:00): 15분
  IF v_dow IN (5, 6) AND (v_hour >= 22 OR v_hour < 2) THEN
    v_base := 15;
  -- 준피크 새벽 (토/일 02:00~04:00): 20분
  ELSIF (v_dow = 6 OR v_dow = 0) AND v_hour >= 2 AND v_hour < 4 THEN
    v_base := 20;
  -- 준피크 (금/토 19:00~22:00 또는 일/월): 20분
  ELSIF (v_dow IN (5, 6) AND v_hour >= 19 AND v_hour < 22) OR v_dow IN (4, 0) THEN
    v_base := 20;
  -- 비피크 (나머지): 30분
  ELSE
    v_base := 30;
  END IF;

  -- Pass 로직 제거: p_user_id 무시, v_base 그대로 반환
  RETURN v_base;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_contact_timer(UUID) IS 'Model B: 시간대별 타이머 계산 (Pass 연장 제거, UUID 파라미터 호환용)';

-- ============================================================
-- 2. 파라미터 없는 버전 제거 (중복 방지, UUID 버전이 DEFAULT NULL로 커버)
-- ============================================================

DROP FUNCTION IF EXISTS calculate_contact_timer();

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
