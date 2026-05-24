-- ============================================================================
-- Migration 233: 야간알림 차단 - 요일 범위 (everyday / weekends)
-- ============================================================================
-- 배경:
--   클럽 비즈니스 특성상 주말(금/토)엔 핫딜 알림 받고 싶은 니즈가 강함
--   "매일 차단" vs "주말만 차단" 2가지 모드만 제공해 UI 단순화
--
-- 설계:
--   - users.quiet_hours_scope TEXT: 'everyday' | 'weekends'
--   - 기본값 'everyday' → 기존 동작과 동일 (하위 호환)
--   - weekends = 금, 토 (클럽 영업 피크, 다음날이 휴일이라 늦게까지 OK)
--   - 일요일은 다음날 월요일 출근이라 weekends에서 제외
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS quiet_hours_scope TEXT NOT NULL DEFAULT 'everyday';

-- 기존 데이터 정리: 이전 3택 버전에서 'weekdays'로 저장된 값을 'everyday'로 마이그레이션
-- (사실상 매일 차단이 가장 안전한 fallback)
UPDATE users SET quiet_hours_scope = 'everyday'
  WHERE quiet_hours_scope NOT IN ('everyday', 'weekends');

-- 기존 제약 제거 후 재생성 (3택 → 2택)
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_quiet_hours_scope;

ALTER TABLE users
  ADD CONSTRAINT chk_quiet_hours_scope
    CHECK (quiet_hours_scope IN ('everyday', 'weekends'));

COMMENT ON COLUMN users.quiet_hours_scope IS
  '야간알림 차단 적용 요일: everyday=매일, weekends=주말만(금/토, 다음날 휴일)';

-- ============================================================================
-- is_in_quiet_hours() 함수 갱신: 요일 scope 반영
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
  v_now_dow SMALLINT;  -- 0=일, 1=월, ..., 6=토 (PostgreSQL DOW)
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

  -- KST 기준 현재 시각 / 요일
  v_now_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Seoul'))::SMALLINT;
  v_now_dow  := EXTRACT(DOW  FROM (now() AT TIME ZONE 'Asia/Seoul'))::SMALLINT;

  -- 시간 범위 매칭
  IF v_end > v_start THEN
    v_in_time_range := v_now_hour >= v_start AND v_now_hour < v_end;
  ELSIF v_end < v_start THEN
    -- 자정 넘김 (예: 22~8)
    v_in_time_range := v_now_hour >= v_start OR v_now_hour < v_end;
  ELSE
    -- start == end → 의미 없음
    RETURN FALSE;
  END IF;

  IF NOT v_in_time_range THEN
    RETURN FALSE;
  END IF;

  -- 요일 scope 매칭 (KST 기준)
  -- weekends: 금(5), 토(6) — 다음날이 휴일이라 차단해도 무방 (클럽 피크지만 늦잠 가능)
  -- everyday: 항상 차단
  IF v_scope = 'weekends' THEN
    v_in_day_scope := v_now_dow IN (5, 6);
  ELSE
    v_in_day_scope := TRUE;
  END IF;

  RETURN v_in_day_scope;
END;
$$;

COMMENT ON FUNCTION is_in_quiet_hours(UUID)
  IS '사용자의 방해금지 시간대 진입 여부 (KST 기준, 요일 scope 반영)';
