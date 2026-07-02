-- ============================================================================
-- Migration 340: 고객 문의 도착 시 운영팀(admin) 푸시 알림
-- send_support_message(337)에 admin 푸시 추가.
--   - notify_user_push 5-arg(강제발송: 카테고리/방해금지 무시) 사용
--   - 직전이 'user' 연속이면 스킵 → 연속 메시지 스팸 방지(새 인바운드만 알림)
--   - in_app_notifications는 type CHECK 제약 회피 + admin 인박스 뱃지로 충분 → 푸시만
-- ============================================================================

CREATE OR REPLACE FUNCTION send_support_message(p_body TEXT)
RETURNS support_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_msg       support_messages;
  v_prev_role TEXT;
  v_name      TEXT;
  v_admin     UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF p_body IS NULL OR char_length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION '메시지를 입력해주세요';
  END IF;

  -- 직전 발신자(스팸 방지 판단용)
  SELECT last_sender_role INTO v_prev_role
  FROM support_threads WHERE user_id = v_uid;

  INSERT INTO support_messages(thread_user_id, sender_id, sender_role, body)
  VALUES (v_uid, v_uid, 'user', trim(p_body))
  RETURNING * INTO v_msg;

  INSERT INTO support_threads(user_id, last_message_at, last_message_body, last_sender_role, user_read_at)
  VALUES (v_uid, v_msg.created_at, v_msg.body, 'user', v_msg.created_at)
  ON CONFLICT (user_id) DO UPDATE
    SET last_message_at   = v_msg.created_at,
        last_message_body = v_msg.body,
        last_sender_role  = 'user',
        user_read_at      = v_msg.created_at;

  -- 새 인바운드(직전이 user 연속이 아닐 때)만 운영팀 전원에게 푸시
  IF v_prev_role IS DISTINCT FROM 'user' THEN
    SELECT COALESCE(display_name, name, '고객') INTO v_name FROM users WHERE id = v_uid;
    FOR v_admin IN
      SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL
    LOOP
      PERFORM notify_user_push(
        v_admin,
        '새 고객 문의',
        v_name || ': ' || left(v_msg.body, 30),
        jsonb_build_object('type', 'support', 'user_id', v_uid::text),
        '/admin/support/' || v_uid::text
      );
    END LOOP;
  END IF;

  RETURN v_msg;
END; $$;
