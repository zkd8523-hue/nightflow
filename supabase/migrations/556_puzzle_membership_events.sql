-- ============================================================================
-- Migration 556: 파티 참여/이탈 이력 테이블 + admin 상세 조회 RPC
-- 날짜: 2026-08-25
-- 배경: puzzle_members는 나가면 DELETE만 하고 이력을 남기지 않아(leave_party,
--   400_leave_party.sql) admin이 "누가 참여했다가 나갔는지"를 볼 수 없었다.
--   puzzle_kicks(350)는 추방 재합류 차단용이라 자진 나가기는 커버 못 함.
--   여기서는 join/leave/kick 3종을 한 테이블에 이벤트로 남기고,
--   admin 파티 통계 화면(클럽 행 펼치기)에서 쓸 RPC를 추가한다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 이벤트 로그 테이블 (append-only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS puzzle_membership_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id  UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('joined', 'left', 'kicked')),
  reason     TEXT,
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_puzzle_membership_events_puzzle
  ON puzzle_membership_events(puzzle_id, created_at);

ALTER TABLE puzzle_membership_events ENABLE ROW LEVEL SECURITY;
-- RLS on, 정책 없음 → 클라 직접 접근 차단(admin RPC=SECURITY DEFINER로만 조회,
-- 기록은 join_puzzle/leave_party/kick_party_member 함수 내부에서만)

COMMENT ON TABLE puzzle_membership_events IS
  '파티 참여(joined)/자진나가기(left)/추방(kicked) 이력. admin 통계 전용 append-only 로그.';

-- ----------------------------------------------------------------------------
-- 2) join_puzzle() 재정의 — 참여 시 이벤트 기록 추가 (349/350 본문 유지)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_puzzle(p_puzzle_id UUID, p_guest_count INTEGER DEFAULT 0)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_total INTEGER;
  v_u users%ROWTYPE;
  v_user_name TEXT;
BEGIN
  v_total := 1 + GREATEST(p_guest_count, 0);
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  SELECT * INTO v_u FROM users WHERE id = auth.uid();

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '퍼즐을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 퍼즐입니다');
  END IF;
  IF v_puzzle.current_count + v_total > v_puzzle.target_count THEN
    RETURN jsonb_build_object('success', false, 'error', '남은 자리가 부족합니다');
  END IF;
  IF v_puzzle.leader_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인이 만든 퍼즐입니다');
  END IF;
  IF EXISTS (SELECT 1 FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 참여한 퍼즐입니다');
  END IF;
  IF EXISTS (SELECT 1 FROM puzzle_kicks WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '이 조각에서 내보내져 다시 합류할 수 없어요');
  END IF;

  INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
    VALUES (p_puzzle_id, auth.uid(), GREATEST(p_guest_count, 0));
  UPDATE puzzles SET current_count = current_count + v_total WHERE id = p_puzzle_id;

  INSERT INTO puzzle_membership_events (puzzle_id, user_id, event_type, actor_id)
    VALUES (p_puzzle_id, auth.uid(), 'joined', auth.uid());

  v_user_name := COALESCE(NULLIF(v_u.name, ''), NULLIF(v_u.display_name, ''), '회원');

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL, v_user_name || '님이 합류했어요', TRUE);
  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
    VALUES (p_puzzle_id, auth.uid(), now())
    ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_member_joined',
    '새로운 참여자!',
    v_user_name || '님이 퍼즐에 참여했습니다. 인원을 확인해보세요!',
    '/puzzles/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true, 'current_count', v_puzzle.current_count + v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3) leave_party() 재정의 — 파티원 자진 나가기 시 이벤트 기록 추가 (400 본문 유지)
--    MD 초대 나가기(puzzle_party_md)는 puzzle_members 대상이 아니므로 기록 안 함.
--    방장 나가기/위임 케이스도 leader 본인의 이탈이므로 기록.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION leave_party(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle      puzzles%ROWTYPE;
  v_guest       INTEGER;
  v_name        TEXT;
  v_md_name     TEXT;
  v_club_name   TEXT;
  v_offer_id    UUID;
  v_rcpt        RECORD;
  v_next_leader UUID;
  v_next_name   TEXT;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF NOT v_puzzle.is_recruiting_party THEN
    RETURN jsonb_build_object('success', false, 'error', '조각이 아닙니다');
  END IF;

  -- 1) MD(초대됨) 자가 나가기 → 슬롯 열림
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid()) THEN
    SELECT offer_id INTO v_offer_id FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
    DELETE FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid();
    SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
      INTO v_md_name FROM users u WHERE u.id = auth.uid();
    SELECT c.name INTO v_club_name
      FROM puzzle_offers o LEFT JOIN clubs c ON c.id = o.club_id WHERE o.id = v_offer_id;
    INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL,
      btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너가 상담에서 나갔어요', TRUE);
    RETURN jsonb_build_object('success', true, 'role', 'md');
  END IF;

  -- 2) 방장 나가기 → 다음 멤버에게 방장 위임 (남은 멤버 없으면 조각 마감)
  IF v_puzzle.leader_id = auth.uid() THEN
    SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
      INTO v_name FROM users WHERE id = auth.uid();
    SELECT guest_count INTO v_guest FROM puzzle_members
      WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();

    SELECT user_id INTO v_next_leader FROM puzzle_members
      WHERE puzzle_id = p_puzzle_id AND user_id <> auth.uid()
      ORDER BY joined_at ASC LIMIT 1;

    DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
    UPDATE puzzles SET current_count = GREATEST(0, current_count - (1 + COALESCE(v_guest, 0)))
      WHERE id = p_puzzle_id;
    INSERT INTO puzzle_membership_events (puzzle_id, user_id, event_type, actor_id)
      VALUES (p_puzzle_id, auth.uid(), 'left', auth.uid());

    IF v_next_leader IS NOT NULL THEN
      UPDATE puzzles SET leader_id = v_next_leader WHERE id = p_puzzle_id;
      SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
        INTO v_next_name FROM users WHERE id = v_next_leader;
      INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
      VALUES (p_puzzle_id, NULL,
        v_name || '님이 나가고 ' || v_next_name || '님이 새 방장이 되었어요', TRUE);
      INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
      VALUES (v_next_leader, 'puzzle_leader_changed', '방장이 되었어요',
        '기존 방장이 나가 회원님이 새 방장이 되었어요. MD 상담을 이어가보세요!',
        '/party/' || p_puzzle_id);
      RETURN jsonb_build_object('success', true, 'role', 'leader_transferred');
    ELSE
      UPDATE puzzles SET status = 'cancelled', cancelled_at = now(),
        cancelled_reason = COALESCE(cancelled_reason, '방장 나감')
        WHERE id = p_puzzle_id;
      UPDATE puzzle_offers SET status = 'expired', updated_at = now()
        WHERE puzzle_id = p_puzzle_id AND status = 'pending';
      INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
      VALUES (p_puzzle_id, NULL, '방장이 나가 조각이 마감되었어요', TRUE);
      FOR v_rcpt IN
        SELECT md_id AS participant_id FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id
      LOOP
        INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
        VALUES (v_rcpt.participant_id, 'puzzle_cancelled', '조각이 마감됐어요',
          '방장이 나가면서 이 조각이 마감됐어요.', '/');
      END LOOP;
      RETURN jsonb_build_object('success', true, 'role', 'leader_cancelled');
    END IF;
  END IF;

  -- 3) 파티원(멤버) 나가기 → 인원 감소
  SELECT guest_count INTO v_guest FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
    INTO v_name FROM users WHERE id = auth.uid();

  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  UPDATE puzzles SET current_count = GREATEST(1, current_count - (1 + COALESCE(v_guest, 0)))
    WHERE id = p_puzzle_id;
  INSERT INTO puzzle_membership_events (puzzle_id, user_id, event_type, actor_id)
    VALUES (p_puzzle_id, auth.uid(), 'left', auth.uid());
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
  VALUES (p_puzzle_id, NULL, v_name || '님이 나갔어요', TRUE);

  RETURN jsonb_build_object('success', true, 'role', 'member');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 4) kick_party_member() 재정의 — 추방 시 이벤트 기록 추가 (350 본문 유지)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kick_party_member(
  p_puzzle_id UUID,
  p_user_id   UUID,
  p_reason    TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_puzzle    puzzles%ROWTYPE;
  v_total     INTEGER;
  v_name      TEXT;
  v_reason    TEXT;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 내보낼 수 있어요');
  END IF;
  IF p_user_id = v_puzzle.leader_id THEN
    RETURN jsonb_build_object('success', false, 'error', '방장은 내보낼 수 없어요');
  END IF;

  SELECT 1 + GREATEST(guest_count, 0) INTO v_total
  FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id;
  IF v_total IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;

  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id;
  UPDATE puzzles
    SET current_count = GREATEST(1, current_count - v_total)
    WHERE id = p_puzzle_id;

  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  INSERT INTO puzzle_kicks (puzzle_id, user_id, reason, kicked_by)
    VALUES (p_puzzle_id, p_user_id, v_reason, auth.uid())
    ON CONFLICT (puzzle_id, user_id)
    DO UPDATE SET reason = EXCLUDED.reason, kicked_by = EXCLUDED.kicked_by, created_at = now();
  INSERT INTO puzzle_membership_events (puzzle_id, user_id, event_type, reason, actor_id)
    VALUES (p_puzzle_id, p_user_id, 'kicked', v_reason, auth.uid());

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '멤버')
    INTO v_name FROM users u WHERE u.id = p_user_id;
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL, v_name || '님이 나갔어요', TRUE);

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    p_user_id,
    'party_removed',
    '조각에서 나가게 됐어요',
    '아쉽게도 함께하지 못하게 됐어요. 다른 조각도 많으니 둘러보세요!'
      || CASE WHEN v_reason IS NOT NULL THEN ' · 방장 한마디: ' || v_reason ELSE '' END,
    '/'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 5) admin_get_club_party_members(): 클럽 행 펼치기용 RPC
--    해당 클럽의 파티별 참여자 목록(닉네임, 상태: 참여중/나감/추방됨) 반환.
--    admin만 호출 가능 (SECURITY DEFINER + 내부 role 체크).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_get_club_party_members(p_club_id UUID)
RETURNS TABLE (
  puzzle_id     UUID,
  puzzle_status TEXT,
  puzzle_created_at TIMESTAMPTZ,
  user_id       UUID,
  display_name  TEXT,
  member_status TEXT,
  reason        TEXT,
  event_at      TIMESTAMPTZ,
  is_leader     BOOLEAN
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '관리자만 조회할 수 있습니다';
  END IF;

  RETURN QUERY
  WITH target_puzzles AS (
    SELECT p.id, p.status, p.created_at, p.leader_id
    FROM puzzles p
    WHERE p.club_id = p_club_id AND p.is_recruiting_party = true
  ),
  current_members AS (
    SELECT
      m.puzzle_id, m.user_id,
      COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '회원') AS display_name,
      '참여중'::TEXT AS member_status,
      NULL::TEXT AS reason,
      m.joined_at AS event_at
    FROM puzzle_members m
    JOIN target_puzzles tp ON tp.id = m.puzzle_id
    JOIN users u ON u.id = m.user_id
  ),
  past_events AS (
    SELECT
      e.puzzle_id, e.user_id,
      COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '회원') AS display_name,
      CASE e.event_type WHEN 'kicked' THEN '추방됨' ELSE '나감' END AS member_status,
      e.reason,
      e.created_at AS event_at
    FROM puzzle_membership_events e
    JOIN target_puzzles tp ON tp.id = e.puzzle_id
    JOIN users u ON u.id = e.user_id
    WHERE e.event_type IN ('left', 'kicked')
      -- 나간 뒤 재합류해서 현재 다시 참여중이면 과거 이탈 기록은 숨김
      AND NOT EXISTS (
        SELECT 1 FROM puzzle_members m2
        WHERE m2.puzzle_id = e.puzzle_id AND m2.user_id = e.user_id
      )
  )
  SELECT
    tp.id, tp.status, tp.created_at,
    x.user_id, x.display_name, x.member_status, x.reason, x.event_at,
    (x.user_id = tp.leader_id) AS is_leader
  FROM target_puzzles tp
  JOIN (
    SELECT * FROM current_members
    UNION ALL
    SELECT * FROM past_events
  ) x ON x.puzzle_id = tp.id
  ORDER BY tp.created_at DESC, x.event_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_get_club_party_members(UUID) TO authenticated;

COMMENT ON FUNCTION admin_get_club_party_members(UUID) IS
  'Admin 전용: 클럽별 파티 참여자 상세(닉네임 + 참여중/나감/추방됨). 파티 통계 클럽 행 펼치기용.';
