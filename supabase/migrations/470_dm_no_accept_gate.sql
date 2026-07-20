-- ============================================================
-- Migration 470: DM 수락 게이트 제거 — 누르면 바로 채팅방
-- ------------------------------------------------------------
-- 배경: 465의 요청→수락 모델은 신청자에게 "거절당함"이라는 좌절감을,
--       수신자에게는 "심사해야 함"이라는 부담을 준다. 밤에 즉흥적으로
--       말 거는 서비스 특성과 맞지 않아 게이트를 없앤다.
--       원치 않는 상대는 기존 차단(user_blocks)으로 막는다.
--
-- 변경:
--   1) open_dm(recipient, shot) 신규 — 첫 메시지 없이 바로 accepted 스레드
--   2) dm_messages INSERT 정책에서 status='accepted' 조건 제거
--   3) 기존 pending 스레드 전부 accepted로 승격 (거절 이력은 유지)
--   4) request_dm은 남겨두되 내부적으로 open_dm과 동일하게 동작(하위 호환)
-- 실행: Supabase 대시보드 SQL Editor 1회. db push 금지.
-- ============================================================

-- 1) 바로 열기 RPC -----------------------------------------------
CREATE OR REPLACE FUNCTION open_dm(p_recipient_id UUID, p_shot_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_existing  dm_threads;
  v_thread_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF v_uid = p_recipient_id THEN RAISE EXCEPTION 'cannot_dm_self'; END IF;

  -- 차단 관계면 열 수 없음 (양방향)
  IF EXISTS (
    SELECT 1 FROM user_blocks
     WHERE (blocker_id = v_uid AND blocked_id = p_recipient_id)
        OR (blocker_id = p_recipient_id AND blocked_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'blocked';
  END IF;

  -- 한 쌍당 스레드 1개 (방향 무관)
  SELECT * INTO v_existing FROM dm_threads
   WHERE LEAST(requester_id, recipient_id)    = LEAST(v_uid, p_recipient_id)
     AND GREATEST(requester_id, recipient_id) = GREATEST(v_uid, p_recipient_id);

  IF v_existing.id IS NOT NULL THEN
    -- pending/declined로 남아있던 과거 스레드도 그냥 연다 (게이트 폐지)
    IF v_existing.status <> 'accepted' THEN
      UPDATE dm_threads
         SET status = 'accepted', accepted_at = COALESCE(accepted_at, now())
       WHERE id = v_existing.id;
    END IF;
    RETURN v_existing.id;
  END IF;

  INSERT INTO dm_threads (requester_id, recipient_id, status, source, shot_id, accepted_at)
    VALUES (v_uid, p_recipient_id, 'accepted', 'live', p_shot_id, now())
    RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION open_dm(UUID, UUID) TO authenticated;

-- 2) 전송 정책에서 accepted 조건 제거 ------------------------------
--    참여자면 언제든 보낼 수 있다. 차단은 open_dm/차단 기능이 담당.
DROP POLICY IF EXISTS "participants send dm_messages" ON dm_messages;
CREATE POLICY "participants send dm_messages" ON dm_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM dm_threads t
                WHERE t.id = dm_messages.thread_id
                  AND auth.uid() IN (t.requester_id, t.recipient_id))
  );

-- 3) 기존 pending 승격 (수락 대기 중이던 대화 살리기) ----------------
UPDATE dm_threads
   SET status = 'accepted', accepted_at = COALESCE(accepted_at, now())
 WHERE status = 'pending';

-- 4) request_dm 하위 호환 — 첫 메시지를 받되 바로 accepted로 개설 -----
--    푸시는 보내지 않는다. 모든 스레드가 accepted가 되면서
--    on_dm_message 트리거(465)가 모든 메시지의 푸시를 담당하기 때문.
--    여기서 또 보내면 첫 메시지만 푸시가 2번 간다.
--    다만 "새 대화가 시작됐다"는 인앱 알림은 첫 대화일 때만 남긴다
--    (트리거는 푸시만 하고 in_app_notifications를 만들지 않음).
CREATE OR REPLACE FUNCTION request_dm(p_recipient_id UUID, p_shot_id UUID, p_first_message TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_thread_id UUID;
  v_is_first  BOOLEAN;
  v_name      TEXT;
  v_preview   TEXT;
BEGIN
  v_thread_id := open_dm(p_recipient_id, p_shot_id);

  IF p_first_message IS NOT NULL AND btrim(p_first_message) <> '' THEN
    SELECT NOT EXISTS (SELECT 1 FROM dm_messages WHERE thread_id = v_thread_id)
      INTO v_is_first;

    -- last_message_at 갱신·푸시는 trg_on_dm_message가 처리
    INSERT INTO dm_messages (thread_id, sender_id, content)
      VALUES (v_thread_id, v_uid, btrim(p_first_message));

    IF v_is_first THEN
      SELECT display_name INTO v_name FROM users WHERE id = v_uid;
      v_preview := left(btrim(p_first_message), 30);
      INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
        VALUES (p_recipient_id, 'dm_request', '새 메시지가 왔어요',
                COALESCE(v_name, '누군가') || ': ' || v_preview, '/messages');
    END IF;
  END IF;

  RETURN v_thread_id;
END;
$$;

-- 5) 수락/거절 RPC 폐기 -------------------------------------------
--    남겨두면 accepted 스레드를 다시 declined로 되돌릴 수 있다.
DROP FUNCTION IF EXISTS respond_dm(UUID, BOOLEAN);

-- 6) 이미 쌓인 "신청/수락" 알림 정리 --------------------------------
--    수락이라는 개념이 사라졌으므로 그 알림은 클릭해도 의미가 없다.
DELETE FROM in_app_notifications WHERE type = 'dm_accepted';

UPDATE in_app_notifications
   SET title = '새 메시지가 왔어요'
 WHERE type = 'dm_request' AND title = '메시지 신청이 왔어요';

COMMENT ON FUNCTION open_dm(UUID, UUID) IS
  '1:1 DM 스레드를 즉시 개설(또는 기존 반환). 수락 게이트 없음 — 차단만이 차단 수단.';
