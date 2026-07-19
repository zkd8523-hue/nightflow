-- ============================================================
-- Migration 465: 1:1 메시지 신청(DM) — 유저 LIVE "나도 갈래"용
-- ------------------------------------------------------------
-- 요청→수락 모델 (낯선 사람 간 consent 게이트, 프라이버시 보호):
--   requester가 신청(첫 메시지 필수) → recipient 수락 시 1:1 대화 개시.
--   거절은 조용히(requester 알림 X). 한 쌍당 스레드 1개(재신청 차단).
-- MD LIVE는 오픈챗(Phase 1)로 분기하므로 여기 대상 아님.
-- 실행: Supabase 대시보드 SQL Editor 1회. db push 금지.
-- ============================================================

-- 1) 스레드 -----------------------------------------------------
CREATE TABLE IF NOT EXISTS dm_threads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined')),
  source        TEXT NOT NULL DEFAULT 'live',
  shot_id       UUID REFERENCES chat_shots(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> recipient_id)
);
-- 한 쌍당 스레드 1개 (방향 무관) → 중복/재신청 차단
CREATE UNIQUE INDEX IF NOT EXISTS uq_dm_threads_pair
  ON dm_threads (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id));
CREATE INDEX IF NOT EXISTS idx_dm_threads_recipient ON dm_threads (recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_dm_threads_requester ON dm_threads (requester_id);

-- 2) 메시지 -----------------------------------------------------
CREATE TABLE IF NOT EXISTS dm_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT,
  media       JSONB NOT NULL DEFAULT '[]',
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dm_messages_thread ON dm_messages (thread_id, created_at);

-- 3) RLS --------------------------------------------------------
ALTER TABLE dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;

-- 스레드: 참여자만 읽기. 생성/수락은 RPC(SECURITY DEFINER)로만 → INSERT/UPDATE 정책 없음(차단).
DROP POLICY IF EXISTS "participants read dm_threads" ON dm_threads;
CREATE POLICY "participants read dm_threads" ON dm_threads
  FOR SELECT USING (auth.uid() IN (requester_id, recipient_id));

-- 메시지: 참여자만 읽기 / accepted 스레드 참여자만 전송(첫 신청 메시지는 request_dm definer가 처리)
DROP POLICY IF EXISTS "participants read dm_messages" ON dm_messages;
CREATE POLICY "participants read dm_messages" ON dm_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM dm_threads t
            WHERE t.id = dm_messages.thread_id
              AND auth.uid() IN (t.requester_id, t.recipient_id))
  );
DROP POLICY IF EXISTS "participants send dm_messages" ON dm_messages;
CREATE POLICY "participants send dm_messages" ON dm_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM dm_threads t
                WHERE t.id = dm_messages.thread_id
                  AND t.status = 'accepted'
                  AND auth.uid() IN (t.requester_id, t.recipient_id))
  );
-- 본인 메시지 삭제(soft) 허용
DROP POLICY IF EXISTS "sender soft-delete dm_messages" ON dm_messages;
CREATE POLICY "sender soft-delete dm_messages" ON dm_messages
  FOR UPDATE USING (sender_id = auth.uid());

-- 4) 알림 타입 CHECK 확장 (기존 364 목록 + dm_request/dm_accepted) --
ALTER TABLE in_app_notifications DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;
ALTER TABLE in_app_notifications ADD CONSTRAINT in_app_notifications_type_check CHECK (type IN (
  'md_approved', 'md_rejected', 'outbid', 'auction_won',
  'contact_deadline_warning', 'noshow_penalty', 'fallback_won',
  'feedback_request', 'md_grade_change', 'cancellation_confirmed',
  'contact_expired_no_fault', 'contact_expired_user_attempted',
  'md_winner_cancelled', 'md_winner_noshow', 'md_new_bid',
  'md_noshow_review', 'noshow_dismissed',
  'puzzle_seat_adjusted', 'puzzle_cancelled',
  'puzzle_offer_received', 'puzzle_offer_accepted', 'puzzle_offer_rejected',
  'puzzle_leader_changed', 'puzzle_member_joined',
  'puzzle_visit_pending', 'puzzle_visit_confirmed',
  'puzzle_promoted_to_flag',
  'offer_withdrawn_by_admin',
  'admin_puzzle_expired', 'admin_puzzle_cancelled',
  'admin_match_expired', 'admin_match_cancelled',
  'chat_reply',
  'party_md_invited', 'party_removed', 'party_md_released',
  'dm_request', 'dm_accepted'
));

-- 5) 신청 RPC ---------------------------------------------------
CREATE OR REPLACE FUNCTION request_dm(p_recipient_id UUID, p_shot_id UUID, p_first_message TEXT)
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
    RETURN v_existing.id;                    -- pending/accepted → 그 스레드로
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

-- 6) 수락/거절 RPC ----------------------------------------------
CREATE OR REPLACE FUNCTION respond_dm(p_thread_id UUID, p_accept BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_thread dm_threads;
  v_name TEXT;
BEGIN
  SELECT * INTO v_thread FROM dm_threads WHERE id = p_thread_id;
  IF v_thread.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_thread.recipient_id <> v_uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_thread.status <> 'pending' THEN RAISE EXCEPTION 'already_responded'; END IF;

  IF p_accept THEN
    UPDATE dm_threads SET status='accepted', accepted_at=now() WHERE id = p_thread_id;
    SELECT display_name INTO v_name FROM users WHERE id = v_uid;
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
      VALUES (v_thread.requester_id, 'dm_accepted', '메시지 신청이 수락됐어요',
              COALESCE(v_name,'상대') || '님과 대화를 시작하세요', '/messages');
    PERFORM notify_user_push(
      v_thread.requester_id, '💬 신청 수락',
      COALESCE(v_name,'상대') || '님이 메시지를 수락했어요',
      jsonb_build_object('type','dm_accepted','thread_id',p_thread_id::text),
      '/messages', 'chat');
  ELSE
    -- 거절: 조용히 (requester 알림 X)
    UPDATE dm_threads SET status='declined' WHERE id = p_thread_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION respond_dm(UUID, BOOLEAN) TO authenticated;

-- 7) 메시지 INSERT 시 last_message_at 갱신 + (accepted면) 상대 푸시 --
CREATE OR REPLACE FUNCTION on_dm_message()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_thread dm_threads;
  v_other UUID;
  v_name TEXT;
BEGIN
  SELECT * INTO v_thread FROM dm_threads WHERE id = NEW.thread_id;
  UPDATE dm_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;

  -- 첫 신청 메시지(pending)는 request_dm에서 이미 알림 → accepted 대화만 여기서 알림
  IF v_thread.status = 'accepted' THEN
    v_other := CASE WHEN NEW.sender_id = v_thread.requester_id
                    THEN v_thread.recipient_id ELSE v_thread.requester_id END;
    SELECT display_name INTO v_name FROM users WHERE id = NEW.sender_id;
    PERFORM notify_user_push(
      v_other, '💬 ' || COALESCE(v_name,'상대'),
      left(COALESCE(NULLIF(btrim(NEW.content),''), '사진'), 40),
      jsonb_build_object('type','dm_message','thread_id',NEW.thread_id::text),
      '/messages', 'chat');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_on_dm_message ON dm_messages;
CREATE TRIGGER trg_on_dm_message
  AFTER INSERT ON dm_messages
  FOR EACH ROW EXECUTE FUNCTION on_dm_message();

-- 8) 실시간 구독 --------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE dm_threads;
