-- Migration 052: NightFlow Pass 로직 제거
-- 날짜: 2026-03-10
-- 목적: Pass 구독 모델 폐기, 광고 기반 수익 모델로 전환

-- ============================================================
-- 1. calculate_contact_timer() 재정의 (Pass 연장 로직 제거)
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_contact_timer()
RETURNS INTEGER AS $$
DECLARE
  v_dow INTEGER;
  v_hour INTEGER;
  v_base INTEGER;
BEGIN
  v_dow := EXTRACT(DOW FROM now());  -- 0=일, 5=금, 6=토
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

  -- Pass 연장 로직 제거: v_base 그대로 반환
  RETURN v_base;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_contact_timer() IS 'Model B: 시간대별 타이머 계산 (Pass 연장 제거)';

-- ============================================================
-- 2. apply_noshow_strike() 재정의 (strike_waiver 로직 제거)
-- ============================================================

CREATE OR REPLACE FUNCTION apply_noshow_strike(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
  v_new_strike INTEGER;
BEGIN
  -- 유저 정보 조회 (FOR UPDATE 락)
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION '유저를 찾을 수 없습니다';
  END IF;

  -- strike_waiver 로직 완전 제거, 모든 노쇼에 즉시 스트라이크 적용
  v_new_strike := v_user.strike_count + 1;

  IF v_new_strike >= 3 THEN
    -- 3회: 영구 차단
    UPDATE users SET
      strike_count = v_new_strike,
      is_blocked = true,
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'permanent_block',
      'waiver_used', false
    );

  ELSIF v_new_strike = 2 THEN
    -- 2회: 90일 정지
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = now() + INTERVAL '90 days',
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_90_days',
      'blocked_until', now() + INTERVAL '90 days',
      'waiver_used', false
    );

  ELSE
    -- 1회: 14일 정지
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = now() + INTERVAL '14 days',
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_14_days',
      'blocked_until', now() + INTERVAL '14 days',
      'waiver_used', false
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION apply_noshow_strike(UUID) IS 'Model B: 노쇼 스트라이크 적용 (waiver 면제 제거)';

-- ============================================================
-- 3. 컬럼 Deprecated 처리
-- ============================================================

-- 컬럼은 보존 (기존 데이터 유지, migration rollback 어려움)
COMMENT ON COLUMN users.pass_expires_at IS 'DEPRECATED (2026-03-10): Pass 기능 제거됨, 향후 삭제 예정';
COMMENT ON COLUMN users.pass_type IS 'DEPRECATED (2026-03-10): Pass 기능 제거됨, 향후 삭제 예정';
COMMENT ON COLUMN users.strike_waiver_count IS 'DEPRECATED (2026-03-10): Pass 기능 제거됨, 향후 삭제 예정';

-- ============================================================
-- 4. 헬퍼 함수 제거 (사용되지 않음)
-- ============================================================

DROP FUNCTION IF EXISTS has_active_pass(UUID);

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
