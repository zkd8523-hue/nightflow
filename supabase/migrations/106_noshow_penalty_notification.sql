-- ============================================================================
-- Migration 106: noshow_penalty 인앱 알림 추가
-- 날짜: 2026-04-16
-- 설명: apply_noshow_strike() 함수에 정지 통보 알림 INSERT 추가
--       기존 로직(Migration 064) 완전 보존, 각 분기 끝에 알림만 추가
-- ============================================================================

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

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      p_user_id,
      'noshow_penalty',
      '계정이 영구 차단되었습니다',
      '노쇼 4회 누적으로 NightFlow 이용이 영구적으로 제한됩니다. 문의는 고객센터로 연락주세요.',
      '/profile'
    );

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

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      p_user_id,
      'noshow_penalty',
      '60일간 이용이 정지되었습니다',
      '노쇼 3회 누적으로 60일간 NightFlow 이용이 정지됩니다. 다음 노쇼 시 영구 차단됩니다.',
      '/profile'
    );

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

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      p_user_id,
      'noshow_penalty',
      '14일간 이용이 정지되었습니다',
      '노쇼 2회 누적으로 14일간 NightFlow 이용이 정지됩니다. 추가 노쇼 시 정지 기간이 더 길어집니다.',
      '/profile'
    );

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

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      p_user_id,
      'noshow_penalty',
      '3일간 이용이 정지되었습니다',
      '노쇼 1회로 3일간 NightFlow 이용이 정지됩니다. 추가 노쇼 시 정지 기간이 더 길어집니다.',
      '/profile'
    );

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_3_days',
      'blocked_until', now() + INTERVAL '3 days',
      'waiver_used', false
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
