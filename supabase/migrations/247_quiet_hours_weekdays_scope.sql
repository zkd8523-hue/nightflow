-- ============================================================================
-- Migration 247: 야간알림 옵트인 - 'weekdays' scope 추가
-- ============================================================================
-- 배경:
--   UI를 옵트아웃("야간 알림 차단")에서 옵트인("야간 알림 받기")으로 전환.
--   "주말만 야간 알림 받기" = 평일(일~목) 22~04 차단 의미.
--   기존 scope enum은 'everyday' | 'weekends'(=금/토 차단)만 지원 → 'weekdays' 추가 필요.
--
-- 설계:
--   - 'weekdays' = 일~목 차단 (= 금/토만 야간 알림 받기)
--   - 기존 'everyday' / 'weekends' 동작은 그대로 유지 (하위 호환)
-- ============================================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_quiet_hours_scope;

ALTER TABLE users
  ADD CONSTRAINT chk_quiet_hours_scope
    CHECK (quiet_hours_scope IN ('everyday', 'weekends', 'weekdays'));

COMMENT ON COLUMN users.quiet_hours_scope IS
  '야간알림 차단 적용 요일: everyday=매일 차단, weekends=금/토 차단, weekdays=일~목 차단(=주말만 받기)';

-- ============================================================================
-- is_in_quiet_hours() 갱신: 'weekdays' 분기 추가
-- ============================================================================
CREATE OR REPLACE FUNCTION is_in_quiet_hours(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_start SMALLINT;
  v_end SMALLINT;
  v_scope TEXT;
  v_now_hour SMALLINT;
  v_now_dow SMALLINT;
  v_in_time_range BOOLEAN;
  v_in_day_scope BOOLEAN;
BEGIN
  SELECT quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_scope
    INTO v_enabled, v_start, v_end, v_scope
    FROM users
    WHERE id = p_user_id;

  IF NOT COALESCE(v_enabled, FALSE) OR v_start IS NULL OR v_end IS NULL THEN
    RETURN FALSE;
  END IF;

  v_now_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Seoul'))::SMALLINT;
  v_now_dow  := EXTRACT(DOW  FROM (now() AT TIME ZONE 'Asia/Seoul'))::SMALLINT;

  IF v_end > v_start THEN
    v_in_time_range := v_now_hour >= v_start AND v_now_hour < v_end;
  ELSIF v_end < v_start THEN
    v_in_time_range := v_now_hour >= v_start OR v_now_hour < v_end;
  ELSE
    RETURN FALSE;
  END IF;

  IF NOT v_in_time_range THEN
    RETURN FALSE;
  END IF;

  -- 요일 scope 매칭 (KST 기준, DOW: 0=일, 1=월, ..., 6=토)
  IF v_scope = 'weekends' THEN
    v_in_day_scope := v_now_dow IN (5, 6);            -- 금/토만 차단
  ELSIF v_scope = 'weekdays' THEN
    v_in_day_scope := v_now_dow NOT IN (5, 6);        -- 일~목 차단 (= 주말만 받기)
  ELSE
    v_in_day_scope := TRUE;                            -- everyday
  END IF;

  RETURN v_in_day_scope;
END;
$$;

COMMENT ON FUNCTION is_in_quiet_hours(UUID)
  IS '사용자의 방해금지 시간대 진입 여부 (KST 기준, 옵트인 시맨틱: weekdays=주말만 받기 지원)';
