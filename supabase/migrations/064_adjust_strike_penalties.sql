-- Migration 064: 스트라이크 패널티 기간 조정
-- 변경: 1회 7일→3일, 2회 30일→14일, 3회 90일→60일, 4회 영구(유지)
-- 근거: 베타 단계 유저 리텐션 고려, 경고 시스템 도입으로 스트라이크 도달 난이도 상승

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
    -- 3회: 60일 정지
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = now() + INTERVAL '60 days',
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_60_days',
      'blocked_until', now() + INTERVAL '60 days',
      'waiver_used', false
    );

  ELSIF v_new_strike = 2 THEN
    -- 2회: 14일 정지
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

  ELSE
    -- 1회: 3일 정지
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = now() + INTERVAL '3 days',
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_3_days',
      'blocked_until', now() + INTERVAL '3 days',
      'waiver_used', false
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
