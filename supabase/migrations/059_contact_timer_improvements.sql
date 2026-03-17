-- Migration 059: 연락 타이머 전략적 개선
-- 날짜: 2026-03-12
-- 목적:
--   1. 타이머 20분 단일화 (4단계 → 단일)
--   2. contact_attempted_at 컬럼 추가 (연락 시도 기록)
--   3. 스트라이크 정책 완화 (3단계 → 4단계)

-- ============================================================
-- 1. calculate_contact_timer() 20분 단일화
-- ============================================================

-- 기존 함수는 (UUID) 시그니처 → 동일 시그니처로 재정의해야 호출부 호환
CREATE OR REPLACE FUNCTION calculate_contact_timer(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
BEGIN
  -- 기존 4단계 (피크 15분/준피크 20분/비피크 30분) → 20분 단일
  -- 근거: 연락 시도(버튼 클릭)까지만 측정
  -- 알림 인지(1-5분) + 앱 확인(1-2분) + 클릭(0.5분) = 3-8분 + 마진
  RETURN 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_contact_timer(UUID) IS '연락 타이머: 20분 단일 (2026-03-12 전략적 개선)';

-- ============================================================
-- 2. contact_attempted_at 컬럼 추가
-- ============================================================

ALTER TABLE auctions ADD COLUMN IF NOT EXISTS contact_attempted_at TIMESTAMPTZ;
COMMENT ON COLUMN auctions.contact_attempted_at IS '낙찰자가 MD 연락 버튼 클릭 시각 (유저 무과실 판정 근거)';

-- ============================================================
-- 3. apply_noshow_strike() 4단계 완화
-- ============================================================
-- 기존: 1회→14일, 2회→90일, 3회→영구
-- 변경: 1회→7일, 2회→30일, 3회→90일, 4회→영구

CREATE OR REPLACE FUNCTION apply_noshow_strike(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
  v_new_strike INTEGER;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION '유저를 찾을 수 없습니다';
  END IF;

  v_new_strike := v_user.strike_count + 1;

  IF v_new_strike >= 4 THEN
    -- 4회 이상: 영구 차단
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

  ELSIF v_new_strike = 3 THEN
    -- 3회: 90일 정지
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

  ELSIF v_new_strike = 2 THEN
    -- 2회: 30일 정지
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = now() + INTERVAL '30 days',
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_30_days',
      'blocked_until', now() + INTERVAL '30 days',
      'waiver_used', false
    );

  ELSE
    -- 1회: 7일 정지
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = now() + INTERVAL '7 days',
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_7_days',
      'blocked_until', now() + INTERVAL '7 days',
      'waiver_used', false
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION apply_noshow_strike(UUID) IS '노쇼 스트라이크: 4단계 (7일/30일/90일/영구), 2026-03-12 완화';

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
