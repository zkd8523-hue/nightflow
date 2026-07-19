-- ============================================================================
-- Migration 469: request_dm — 기존 스레드에도 메시지를 실제로 전송
-- 배경:
--   기존 request_dm(465)은 이미 스레드가 있으면 thread_id만 RETURN하고
--   p_first_message를 버렸다. LIVE 뷰어의 인라인 "메시지 보내기"를 DM에 연결하면
--   두 번째 메시지부터 조용히 사라지는 문제가 생김.
-- 변경:
--   - declined: 기존과 동일하게 차단
--   - pending/accepted 기존 스레드: 메시지를 dm_messages에 INSERT 후 thread_id 반환
--     (accepted면 trg_on_dm_message가 상대에게 푸시 발송)
--   - 신규: 기존과 동일 (스레드 생성 + 첫 메시지 + 신청 알림/푸시)
-- 적용: Supabase 대시보드 SQL Editor에 통째로 1회 실행. db push 금지.
-- ============================================================================

CREATE OR REPLACE FUNCTION request_dm(
  p_recipient_id UUID,
  p_shot_id UUID,
  p_first_message TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existing dm_threads;
  v_thread_id UUID;
  v_name TEXT;
  v_preview TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF v_uid = p_recipient_id THEN RAISE EXCEPTION 'cannot_dm_self'; END IF;
  IF p_first_message IS NULL OR btrim(p_first_message) = '' THEN
    RAISE EXCEPTION 'message_required';
  END IF;

  -- 기존 스레드(한 쌍당 1개) 확인
  SELECT * INTO v_existing FROM dm_threads
   WHERE LEAST(requester_id,recipient_id)   = LEAST(v_uid,p_recipient_id)
     AND GREATEST(requester_id,recipient_id) = GREATEST(v_uid,p_recipient_id);

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'declined' THEN
      RAISE EXCEPTION 'request_declined';   -- 재신청 차단
    END IF;
    -- ★ 변경점: 메시지를 버리지 않고 기존 스레드에 실제로 전송
    --   accepted면 trg_on_dm_message가 상대에게 푸시까지 처리.
    INSERT INTO dm_messages (thread_id, sender_id, content)
      VALUES (v_existing.id, v_uid, btrim(p_first_message));
    RETURN v_existing.id;
  END IF;

  INSERT INTO dm_threads (requester_id, recipient_id, status, source, shot_id)
    VALUES (v_uid, p_recipient_id, 'pending', 'live', p_shot_id)
    RETURNING id INTO v_thread_id;

  INSERT INTO dm_messages (thread_id, sender_id, content)
    VALUES (v_thread_id, v_uid, btrim(p_first_message));

  SELECT display_name INTO v_name FROM users WHERE id = v_uid;
  v_preview := left(btrim(p_first_message), 30);

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (p_recipient_id, 'dm_request', '메시지 신청이 왔어요',
            COALESCE(v_name,'누군가') || ': ' || v_preview, '/messages');
  PERFORM notify_user_push(
    p_recipient_id, '💬 메시지 신청',
    COALESCE(v_name,'누군가') || '님이 메시지를 신청했어요',
    jsonb_build_object('type','dm_request','thread_id',v_thread_id::text),
    '/messages', 'chat');

  RETURN v_thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION request_dm(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION request_dm(UUID, UUID, TEXT) IS
  'LIVE에서 1:1 메시지 전송. 신규는 신청(pending)+알림, 기존 스레드는 메시지 append (Migration 469).';
