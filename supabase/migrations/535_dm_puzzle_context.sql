-- ============================================================
-- Migration 535: DM에 파티(깃발/조각) 컨텍스트 태깅
-- ------------------------------------------------------------
-- 배경: 파티 상세에서 파트너가 "1:1 메시지"로 방장에게 바로 말 걸 수
--       있게 여는데, 방장 입장에선 여러 파트너의 1:1이 메시지함에
--       그대로 쌓이면 어느 파티 건인지 알 수 없다.
--       스레드는 두 사람당 1개뿐(465 unique pair index)이라 같은
--       쌍이 나중에 다른 파티로 다시 말을 걸 수도 있으므로,
--       "마지막으로 어떤 파티에서 시작됐는지"를 매번 최신화한다.
-- 실행: Supabase 대시보드 SQL Editor 1회. db push 금지.
-- ============================================================

ALTER TABLE dm_threads
  ADD COLUMN IF NOT EXISTS context_puzzle_id UUID REFERENCES puzzles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dm_threads_context_puzzle ON dm_threads (context_puzzle_id);

-- open_dm에 p_puzzle_id 추가(기존 2-인자 호출과 하위호환 — default NULL 추가라 CREATE OR REPLACE로 충분)
CREATE OR REPLACE FUNCTION open_dm(p_recipient_id UUID, p_shot_id UUID DEFAULT NULL, p_puzzle_id UUID DEFAULT NULL)
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

  IF EXISTS (
    SELECT 1 FROM user_blocks
     WHERE (blocker_id = v_uid AND blocked_id = p_recipient_id)
        OR (blocker_id = p_recipient_id AND blocked_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'blocked';
  END IF;

  SELECT * INTO v_existing FROM dm_threads
   WHERE LEAST(requester_id, recipient_id)    = LEAST(v_uid, p_recipient_id)
     AND GREATEST(requester_id, recipient_id) = GREATEST(v_uid, p_recipient_id);

  IF v_existing.id IS NOT NULL THEN
    -- pending/declined로 남아있던 과거 스레드도 그냥 연다 (게이트 폐지, 470)
    -- 컨텍스트는 새 파티에서 다시 말 걸면 최신 것으로 갱신한다.
    UPDATE dm_threads
       SET status = 'accepted',
           accepted_at = COALESCE(accepted_at, now()),
           context_puzzle_id = COALESCE(p_puzzle_id, context_puzzle_id)
     WHERE id = v_existing.id;
    RETURN v_existing.id;
  END IF;

  INSERT INTO dm_threads (requester_id, recipient_id, status, source, shot_id, accepted_at, context_puzzle_id)
    VALUES (v_uid, p_recipient_id, 'accepted', 'live', p_shot_id, now(), p_puzzle_id)
    RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;
GRANT EXECUTE ON FUNCTION open_dm(UUID, UUID, UUID) TO authenticated;

-- request_dm도 동일하게 p_puzzle_id 전달만 추가 (내부적으로 open_dm 호출)
CREATE OR REPLACE FUNCTION request_dm(p_recipient_id UUID, p_shot_id UUID, p_first_message TEXT, p_puzzle_id UUID DEFAULT NULL)
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
  v_thread_id := open_dm(p_recipient_id, p_shot_id, p_puzzle_id);

  IF p_first_message IS NOT NULL AND btrim(p_first_message) <> '' THEN
    SELECT NOT EXISTS (SELECT 1 FROM dm_messages WHERE thread_id = v_thread_id)
      INTO v_is_first;

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
GRANT EXECUTE ON FUNCTION request_dm(UUID, UUID, TEXT, UUID) TO authenticated;

COMMENT ON COLUMN dm_threads.context_puzzle_id IS
  '이 DM이 마지막으로 어느 파티(깃발/조각) 상세에서 시작됐는지. 메시지함에서 파티별로 묶어 보여주는 용도.';
