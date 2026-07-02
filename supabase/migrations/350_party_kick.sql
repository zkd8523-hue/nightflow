-- ============================================================================
-- Migration 350: 조각 단체방 추방(내보내기) + 재합류 차단
-- 날짜: 2026-07-02
-- 설명:
--   방장이 조각(파티) 멤버를 내보낼 수 있음.
--   - 단체방 시스템 메시지는 중립 표현("OOO님이 나갔어요") → 공개 망신 방지.
--   - 추방당한 유저에게만 1:1 알림 + (선택)방장 한마디 사유.
--   - 재합류 차단: puzzle_kicks 기록 → join_puzzle에서 거부.
--   전부 ADDITIVE (테이블/함수 추가 + join_puzzle 재정의).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 추방 이력 (재합류 차단용)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS puzzle_kicks (
  puzzle_id  UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     TEXT,
  kicked_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (puzzle_id, user_id)
);
-- RLS on, 정책 없음 → 클라 직접 접근 차단(추방 RPC=SECURITY DEFINER로만 기록/조회)
ALTER TABLE puzzle_kicks ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2) kick_party_member(): 방장이 멤버 내보내기
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

  -- 대상이 실제 멤버인지 + 차지한 인원(본인+동행)
  SELECT 1 + GREATEST(guest_count, 0) INTO v_total
  FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id;
  IF v_total IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;

  -- 멤버 제거 + 인원 감소(방장 1명 밑으로 내려가지 않게)
  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id;
  UPDATE puzzles
    SET current_count = GREATEST(1, current_count - v_total)
    WHERE id = p_puzzle_id;

  -- 재합류 차단 기록
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  INSERT INTO puzzle_kicks (puzzle_id, user_id, reason, kicked_by)
    VALUES (p_puzzle_id, p_user_id, v_reason, auth.uid())
    ON CONFLICT (puzzle_id, user_id)
    DO UPDATE SET reason = EXCLUDED.reason, kicked_by = EXCLUDED.kicked_by, created_at = now();

  -- 단체방 중립 시스템 메시지
  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '멤버')
    INTO v_name FROM users u WHERE u.id = p_user_id;
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL, v_name || '님이 나갔어요', TRUE);

  -- 추방당한 유저에게만 담백한 1:1 알림 (+ 방장 한마디 있으면 부드럽게)
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
GRANT EXECUTE ON FUNCTION kick_party_member(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) join_puzzle(): 추방 이력 있으면 재합류 거부 (349 본문 + 차단 체크)
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
  -- 추방 이력 → 재합류 차단
  IF EXISTS (SELECT 1 FROM puzzle_kicks WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '이 조각에서 내보내져 다시 합류할 수 없어요');
  END IF;

  INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
    VALUES (p_puzzle_id, auth.uid(), GREATEST(p_guest_count, 0));
  UPDATE puzzles SET current_count = current_count + v_total WHERE id = p_puzzle_id;

  v_user_name := COALESCE(NULLIF(v_u.name, ''), NULLIF(v_u.display_name, ''), '회원');

  -- 단체채팅 시스템 메시지 + 합류자 본인 읽음 초기화
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

COMMENT ON TABLE puzzle_kicks IS
  '조각 단체방 추방 이력. 재합류 차단(join_puzzle) + 방장 한마디 사유 보관.';
