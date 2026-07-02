-- ============================================================================
-- Migration 352: 조각 단체방 오퍼 투표(좋아요/싫어요) + MD 초대(단체방 합류)
-- 날짜: 2026-07-02
-- 설명:
--   조각 단체채팅 안에서 받은 오퍼들을 보고, 멤버들이 좋아요/싫어요 →
--   방장이 그중 한 MD를 단체방에 초대(1명). 초대된 MD는 단체채팅 참여자가 됨.
--   → 조각의 MD 상담은 1:1(puzzle_offer_messages) 대신 단체방으로 통합.
--   ADDITIVE (테이블/함수 추가 + is_party_participant / send_party_message 재정의).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 오퍼 투표 (멤버별 좋아요/싫어요)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS puzzle_offer_votes (
  offer_id   UUID NOT NULL REFERENCES puzzle_offers(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote       TEXT NOT NULL CHECK (vote IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_offer_votes_offer ON puzzle_offer_votes(offer_id);
ALTER TABLE puzzle_offer_votes ENABLE ROW LEVEL SECURITY;
-- 집계는 SECURITY DEFINER RPC로. 본인 투표만 직접 관리 허용.
DROP POLICY IF EXISTS "own offer votes" ON puzzle_offer_votes;
CREATE POLICY "own offer votes" ON puzzle_offer_votes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2) 단체방에 초대된 MD (조각당 1명)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS puzzle_party_md (
  puzzle_id  UUID PRIMARY KEY REFERENCES puzzles(id) ON DELETE CASCADE,
  md_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_id   UUID REFERENCES puzzle_offers(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE puzzle_party_md ENABLE ROW LEVEL SECURITY;
-- 클라 직접 접근 불필요(참여자 판별은 is_party_participant, 초대는 RPC). 조회는 참여자에게만.
DROP POLICY IF EXISTS "party md readable by participants" ON puzzle_party_md;
CREATE POLICY "party md readable by participants" ON puzzle_party_md
  FOR SELECT USING (is_party_participant(puzzle_id, auth.uid()) OR md_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3) is_party_participant 재정의: 방장 OR 멤버 OR 초대된 MD
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_party_participant(p_puzzle_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = p_user_id
  );
$$;

-- ----------------------------------------------------------------------------
-- 4) vote_offer(): 멤버가 오퍼에 좋아요/싫어요 (같은 값 재클릭=취소)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vote_offer(p_offer_id UUID, p_vote TEXT)
RETURNS JSONB AS $$
DECLARE
  v_puzzle_id UUID;
  v_existing  TEXT;
BEGIN
  IF p_vote NOT IN ('like', 'dislike') THEN
    RETURN jsonb_build_object('success', false, 'error', '잘못된 요청입니다');
  END IF;

  SELECT puzzle_id INTO v_puzzle_id FROM puzzle_offers WHERE id = p_offer_id;
  IF v_puzzle_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;
  IF NOT is_party_participant(v_puzzle_id, auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;

  SELECT vote INTO v_existing FROM puzzle_offer_votes
    WHERE offer_id = p_offer_id AND user_id = auth.uid();

  IF v_existing = p_vote THEN
    -- 같은 값 재클릭 → 취소
    DELETE FROM puzzle_offer_votes WHERE offer_id = p_offer_id AND user_id = auth.uid();
    RETURN jsonb_build_object('success', true, 'vote', NULL);
  END IF;

  INSERT INTO puzzle_offer_votes (offer_id, user_id, vote)
  VALUES (p_offer_id, auth.uid(), p_vote)
  ON CONFLICT (offer_id, user_id) DO UPDATE SET vote = EXCLUDED.vote, created_at = now();

  RETURN jsonb_build_object('success', true, 'vote', p_vote);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION vote_offer(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) invite_md_to_party(): 방장이 MD 1명을 단체방에 초대(교체식)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invite_md_to_party(p_puzzle_id UUID, p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle    puzzles%ROWTYPE;
  v_offer     puzzle_offers%ROWTYPE;
  v_md_name   TEXT;
  v_club_name TEXT;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 초대할 수 있어요');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL OR v_offer.puzzle_id <> p_puzzle_id THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  -- 이미 같은 MD가 초대돼 있으면 그대로 성공
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = v_offer.md_id) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  -- 교체식(1명): 기존 MD 있으면 대체
  INSERT INTO puzzle_party_md (puzzle_id, md_id, offer_id)
  VALUES (p_puzzle_id, v_offer.md_id, p_offer_id)
  ON CONFLICT (puzzle_id) DO UPDATE
    SET md_id = EXCLUDED.md_id, offer_id = EXCLUDED.offer_id, invited_at = now();

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
    INTO v_md_name FROM users u WHERE u.id = v_offer.md_id;
  SELECT name INTO v_club_name FROM clubs WHERE id = v_offer.club_id;

  -- 단체방 시스템 메시지 + MD 읽음 초기화
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
  VALUES (
    p_puzzle_id, NULL,
    COALESCE(v_club_name, v_md_name) || ' MD가 상담을 위해 들어왔어요',
    TRUE
  );
  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, v_offer.md_id, now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  -- MD에게 알림
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'party_md_invited',
    '단체채팅에 초대됐어요!',
    '방장이 상담을 위해 단체채팅에 초대했어요. 지금 대화를 시작해보세요!',
    '/party/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION invite_md_to_party(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) get_party_offers(): 단체방 오퍼 리스트 (참여자 전용)
--    시크릿 유지: MD 연락처 비노출, 클럽명/가격/코멘트/투표만.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_party_offers(p_puzzle_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.like_count DESC, t.created_at ASC), '[]'::jsonb)
  FROM (
    SELECT
      o.id                AS offer_id,
      o.md_id             AS md_id,
      c.name              AS club_name,
      o.table_type        AS table_type,
      o.proposed_price    AS proposed_price,
      o.includes          AS includes,
      o.comment           AS comment,
      o.status            AS status,
      o.created_at        AS created_at,
      (SELECT count(*) FROM puzzle_offer_votes v WHERE v.offer_id = o.id AND v.vote = 'like')    AS like_count,
      (SELECT count(*) FROM puzzle_offer_votes v WHERE v.offer_id = o.id AND v.vote = 'dislike') AS dislike_count,
      (SELECT v.vote FROM puzzle_offer_votes v WHERE v.offer_id = o.id AND v.user_id = auth.uid()) AS my_vote,
      EXISTS (SELECT 1 FROM puzzle_party_md pm WHERE pm.puzzle_id = p_puzzle_id AND pm.md_id = o.md_id) AS is_invited
    FROM puzzle_offers o
    LEFT JOIN clubs c ON c.id = o.club_id
    WHERE o.puzzle_id = p_puzzle_id
      AND o.status IN ('pending', 'accepted')
      AND is_party_participant(p_puzzle_id, auth.uid())
  ) t;
$$;
GRANT EXECUTE ON FUNCTION get_party_offers(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7) send_party_message() 재정의: 푸시 대상에 초대된 MD 포함
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION send_party_message(
  p_puzzle_id UUID,
  p_content   TEXT,
  p_media     JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_puzzle      puzzles%ROWTYPE;
  v_msg_id      UUID;
  v_sender_name TEXT;
  v_recipient   RECORD;
BEGIN
  IF COALESCE(btrim(p_content), '') = '' AND COALESCE(jsonb_array_length(p_media), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '내용을 입력해주세요');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF NOT is_party_participant(p_puzzle_id, auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;
  IF v_puzzle.status IN ('expired', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 조각입니다');
  END IF;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, media)
  VALUES (p_puzzle_id, auth.uid(), COALESCE(p_content, ''), COALESCE(p_media, '[]'::jsonb))
  RETURNING id INTO v_msg_id;

  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, auth.uid(), now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '멤버')
    INTO v_sender_name FROM users u WHERE u.id = auth.uid();

  -- 다른 참여자 전원(방장+멤버+초대된 MD)에게 푸시
  FOR v_recipient IN
    SELECT participant_id FROM (
      SELECT leader_id AS participant_id FROM puzzles WHERE id = p_puzzle_id
      UNION
      SELECT user_id FROM puzzle_members WHERE puzzle_id = p_puzzle_id
      UNION
      SELECT md_id FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id
    ) parts
    WHERE participant_id <> auth.uid()
  LOOP
    PERFORM notify_user_push(
      v_recipient.participant_id,
      '💬 ' || v_sender_name,
      left(COALESCE(NULLIF(btrim(p_content), ''), '사진을 보냈어요'), 40),
      jsonb_build_object('type', 'party_chat', 'puzzle_id', p_puzzle_id::text),
      '/party/' || p_puzzle_id::text,
      'chat'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE puzzle_offer_votes IS '조각 단체방 오퍼 투표(좋아요/싫어요). 멤버별 1표.';
COMMENT ON TABLE puzzle_party_md IS '조각 단체방에 초대된 MD (조각당 1명). is_party_participant에 포함.';
