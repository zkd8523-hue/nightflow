-- Migration 406: 오퍼 채팅 admin 알림 (채팅 시작 + MD 3시간 무응답)
-- 적용일: 2026-07-02
--
-- 배경: 앱 미출시 상태라 유저가 MD에게 채팅 시작해도 MD가 모를 수 있음.
--   admin(운영팀)이 푸시로 알고 MD에게 직접 DM할 수 있도록 알림 2종 추가.
--
--   1) 채팅 시작: 방장이 MD에게 첫 메시지 보낼 때 admin 푸시 1회
--      → send_offer_message()에 추가 (leader_chat_started_at 세팅 지점)
--   2) MD 3시간 무응답: 방장 첫 메시지 후 3시간 지나도 MD 답 없으면 admin 푸시 1회
--      → notify_admin_md_noreply() + cron(5분)
--
-- 둘 다 notify_admins_push 경유(Vault 인증), data.url로 /messages/{offer_id} 딥링크.
-- 조각(is_recruiting_party)은 단체채팅이라 제외 (send_offer_message가 이미 차단).

-- 무응답 3시간 알림 중복방지 컬럼
ALTER TABLE puzzle_offers ADD COLUMN IF NOT EXISTS md_noreply_notified_at TIMESTAMPTZ;

-- ============================================================================
-- send_offer_message: 채팅 시작 시 admin 푸시 추가 (Migration 361 본문 보존)
-- ============================================================================
CREATE OR REPLACE FUNCTION send_offer_message(
  p_offer_id UUID, p_content TEXT, p_media JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE; v_puzzle puzzles%ROWTYPE; v_md users%ROWTYPE;
  v_is_md BOOLEAN; v_is_leader BOOLEAN;
  v_leader_msg_count INT; v_md_msg_count INT; v_leader_first BOOLEAN;
  v_active_chats INT; v_msg_id UUID;
  v_leader_name TEXT; v_md_name TEXT; v_club_name TEXT;
BEGIN
  IF NOT is_offer_chat_enabled() THEN RETURN jsonb_build_object('success', false, 'error', '채팅이 비활성화되어 있습니다'); END IF;
  IF COALESCE(btrim(p_content), '') = '' AND COALESCE(jsonb_array_length(p_media), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '내용을 입력해주세요'); END IF;
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다'); END IF;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;
  IF v_puzzle.is_recruiting_party THEN RETURN jsonb_build_object('success', false, 'error', '조각은 단체채팅을 이용해주세요'); END IF;
  v_is_md := (auth.uid() = v_offer.md_id); v_is_leader := (auth.uid() = v_puzzle.leader_id);
  IF NOT (v_is_md OR v_is_leader) THEN RETURN jsonb_build_object('success', false, 'error', '대화 참여자가 아닙니다'); END IF;
  IF v_puzzle.status IN ('expired', 'cancelled') THEN RETURN jsonb_build_object('success', false, 'error', '종료된 깃발입니다'); END IF;
  IF v_offer.status IN ('expired', 'rejected', 'withdrawn') THEN RETURN jsonb_build_object('success', false, 'error', '종료된 대화입니다'); END IF;

  IF v_is_leader THEN
    SELECT NOT EXISTS(SELECT 1 FROM puzzle_offer_messages WHERE offer_id = p_offer_id AND sender_id = v_puzzle.leader_id) INTO v_leader_first;
    IF v_leader_first THEN
      SELECT count(DISTINCT m.offer_id) INTO v_active_chats FROM puzzle_offer_messages m
        JOIN puzzle_offers o ON o.id = m.offer_id
        WHERE o.puzzle_id = v_puzzle.id AND m.sender_id = v_puzzle.leader_id AND o.status NOT IN ('rejected', 'expired', 'withdrawn');
      IF v_active_chats >= 3 THEN RETURN jsonb_build_object('success', false, 'error', '최대 3팀까지만 대화할 수 있어요. 기존 대화를 정리해 주세요'); END IF;
      UPDATE puzzle_offers SET leader_chat_started_at = now() WHERE id = p_offer_id;

      -- 채팅 시작 → admin 푸시 1회 (data.url 딥링크)
      SELECT display_name INTO v_leader_name FROM users WHERE id = v_puzzle.leader_id;
      SELECT display_name INTO v_md_name FROM users WHERE id = v_offer.md_id;
      SELECT name INTO v_club_name FROM clubs WHERE id = v_offer.club_id;
      PERFORM notify_admins_push(
        '💬 채팅이 시작됐어요',
        COALESCE(v_leader_name,'유저') || ' → ' || COALESCE(v_md_name,'MD')
          || CASE WHEN v_club_name IS NOT NULL THEN ' · ' || v_club_name ELSE '' END,
        jsonb_build_object('type','offer_chat_started','offer_id',p_offer_id::TEXT,'url','/messages/' || p_offer_id::TEXT)
      );
    END IF;
  END IF;

  IF v_is_md AND v_offer.status = 'pending' THEN
    SELECT count(*) INTO v_leader_msg_count FROM puzzle_offer_messages WHERE offer_id = p_offer_id AND sender_id = v_puzzle.leader_id;
    IF v_leader_msg_count = 0 THEN RETURN jsonb_build_object('success', false, 'error', '방장이 먼저 대화를 시작해야 합니다'); END IF;
    SELECT count(*) INTO v_md_msg_count FROM puzzle_offer_messages WHERE offer_id = p_offer_id AND sender_id = v_offer.md_id;
    IF v_md_msg_count = 0 THEN
      SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;
      IF COALESCE(v_md.md_credits, 0) < 15 THEN RETURN jsonb_build_object('success', false, 'error', '크레딧이 부족합니다 (15 필요)'); END IF;
      UPDATE users SET md_credits = md_credits - 15 WHERE id = v_offer.md_id;
    END IF;
  END IF;

  INSERT INTO puzzle_offer_messages (offer_id, sender_id, content, media)
  VALUES (p_offer_id, auth.uid(), COALESCE(p_content, ''), COALESCE(p_media, '[]'::jsonb)) RETURNING id INTO v_msg_id;

  IF v_is_leader THEN
    UPDATE puzzle_offers SET leader_read_at = now() WHERE id = p_offer_id;
    PERFORM notify_user_push(v_offer.md_id, '💬 방장이 메시지를 보냈어요',
      left(COALESCE(NULLIF(btrim(p_content), ''), '사진을 보냈어요'), 40),
      jsonb_build_object('type', 'offer_chat', 'offer_id', p_offer_id::text), '/messages/' || p_offer_id::text, 'chat');
  ELSE
    UPDATE puzzle_offers SET md_read_at = now() WHERE id = p_offer_id;
    PERFORM notify_user_push(v_puzzle.leader_id, '💬 MD가 답장했어요',
      left(COALESCE(NULLIF(btrim(p_content), ''), '사진을 보냈어요'), 40),
      jsonb_build_object('type', 'offer_chat', 'offer_id', p_offer_id::text), '/messages/' || p_offer_id::text, 'chat');
  END IF;
  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- MD 3시간 무응답 → admin 알림 (cron 5분마다, 오퍼당 1회)
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_admin_md_noreply()
RETURNS INTEGER AS $$
DECLARE
  v_rec RECORD; v_count INTEGER := 0;
  v_leader_name TEXT; v_md_name TEXT; v_club_name TEXT;
BEGIN
  FOR v_rec IN
    SELECT o.id AS offer_id, o.puzzle_id, o.md_id, o.club_id, p.leader_id
    FROM puzzle_offers o JOIN puzzles p ON p.id = o.puzzle_id
    WHERE o.leader_chat_started_at IS NOT NULL
      AND o.leader_chat_started_at < now() - interval '3 hours'
      AND o.md_noreply_notified_at IS NULL
      AND o.status NOT IN ('rejected','expired','withdrawn','accepted')
      AND p.status NOT IN ('expired','cancelled')
      AND NOT EXISTS (SELECT 1 FROM puzzle_offer_messages m WHERE m.offer_id = o.id AND m.sender_id = o.md_id)
  LOOP
    UPDATE puzzle_offers SET md_noreply_notified_at = now() WHERE id = v_rec.offer_id AND md_noreply_notified_at IS NULL;
    SELECT display_name INTO v_leader_name FROM users WHERE id = v_rec.leader_id;
    SELECT display_name INTO v_md_name FROM users WHERE id = v_rec.md_id;
    SELECT name INTO v_club_name FROM clubs WHERE id = v_rec.club_id;
    PERFORM notify_admins_push(
      '⏰ MD 답장 없음 (3시간)',
      COALESCE(v_md_name,'MD') || '가 ' || COALESCE(v_leader_name,'유저') || '에게 답장 안 함'
        || CASE WHEN v_club_name IS NOT NULL THEN ' · ' || v_club_name ELSE '' END,
      jsonb_build_object('type','md_noreply','offer_id',v_rec.offer_id::TEXT,'url','/messages/' || v_rec.offer_id::TEXT)
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- cron: 5분마다
DO $do$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname='admin-md-noreply-3h' LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $do$;
SELECT cron.schedule('admin-md-noreply-3h', '*/5 * * * *', 'SELECT notify_admin_md_noreply();');
