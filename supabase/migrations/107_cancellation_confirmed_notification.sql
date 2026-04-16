-- ============================================================================
-- Migration 107: cancellation_confirmed 인앱 알림 추가
-- 날짜: 2026-04-16
-- 설명: apply_cancel_warning() 함수에 취소 확정 알림 INSERT 추가
--       기존 로직(Migration 061) 완전 보존, RETURN 직전에 알림만 추가
--       스트라이크 전환 시: noshow_penalty 알림(Migration 106)과 별도로 발송
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_cancel_warning(
  p_user_id UUID,
  p_auction_id UUID,
  p_warning_points INTEGER,
  p_cancel_type cancellation_type
)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
  v_total_unconsumed INTEGER;
  v_strike_result JSON := NULL;
  v_strike_triggered BOOLEAN := false;
BEGIN
  -- 1. user row FOR UPDATE 락
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION '유저를 찾을 수 없습니다';
  END IF;

  -- 2. user_warnings INSERT
  INSERT INTO user_warnings (user_id, auction_id, warning_points, cancel_type)
  VALUES (p_user_id, p_auction_id, p_warning_points, p_cancel_type);

  -- 3. 미소진(consumed=false) 경고점 합산
  SELECT COALESCE(SUM(warning_points), 0)
  INTO v_total_unconsumed
  FROM user_warnings
  WHERE user_id = p_user_id AND consumed_by_strike = false;

  -- 4. warning_count 캐시 업데이트
  UPDATE users SET warning_count = v_total_unconsumed WHERE id = p_user_id;

  -- 5. 합산 >= 3이면: 모든 미소진 경고 consumed 처리 → apply_noshow_strike() 호출
  IF v_total_unconsumed >= 3 THEN
    -- 미소진 경고 모두 소진 처리
    UPDATE user_warnings
    SET consumed_by_strike = true
    WHERE user_id = p_user_id AND consumed_by_strike = false;

    -- 스트라이크 부과 (이 함수가 noshow_penalty 알림도 자동 발송)
    v_strike_result := apply_noshow_strike(p_user_id);
    v_strike_triggered := true;

    -- 소진 후 남은 경고점 재계산 (항상 0이 됨)
    SELECT COALESCE(SUM(warning_points), 0)
    INTO v_total_unconsumed
    FROM user_warnings
    WHERE user_id = p_user_id AND consumed_by_strike = false;

    UPDATE users SET warning_count = v_total_unconsumed WHERE id = p_user_id;
  END IF;

  -- 6. 사용자에게 취소 확정 인앱 알림
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    p_user_id,
    'cancellation_confirmed',
    '낙찰 취소가 확정되었습니다',
    CASE
      WHEN v_strike_triggered THEN
        '경고 ' || p_warning_points || '점이 부과되어 누적 3점 도달, 스트라이크가 적용되었습니다.'
      WHEN p_warning_points = 0 THEN
        '취소가 정상 처리되었습니다. (무패널티)'
      ELSE
        '경고 ' || p_warning_points || '점이 부과되었습니다. (현재 누적 ' || v_total_unconsumed || '/3점)'
    END,
    '/profile'
  );

  -- 7. JSON 반환
  RETURN json_build_object(
    'warning_points', p_warning_points,
    'total_warnings', v_total_unconsumed,
    'strike_triggered', v_strike_triggered,
    'strike_result', v_strike_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION apply_cancel_warning(UUID, UUID, INTEGER, cancellation_type)
  IS '취소 경고 부과 + 인앱 알림: Grace +1, Late +2. 3경고 = 1스트라이크. (Migration 107, 2026-04-16)';
