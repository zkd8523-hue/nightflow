-- ============================================================================
-- Migration 364: 조각 채팅방 MD 정보 누수 차단 + MD 내보내기 알림
-- 날짜: 2026-07-02
-- 1) get_party_offers: MD 호출 시 빈 배열 (경쟁 오퍼 노출 차단 = 시크릿오퍼 유지)
-- 2) vote_offer: MD 투표 차단
-- 3) release_party_md: MD에게 상담 종료 알림
-- 4) in_app_notifications CHECK에 'party_md_released' 추가
-- ============================================================================

-- 헬퍼: 이 조각의 MD인가 (오퍼 낸 MD 또는 초대된 MD)
CREATE OR REPLACE FUNCTION is_puzzle_md(p_puzzle_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM puzzle_offers WHERE puzzle_id = p_puzzle_id AND md_id = p_user_id)
      OR EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = p_user_id);
$$;
GRANT EXECUTE ON FUNCTION is_puzzle_md(UUID, UUID) TO authenticated;

-- 1) get_party_offers: MD면 빈 배열
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
      AND NOT is_puzzle_md(p_puzzle_id, auth.uid())  -- MD는 경쟁 오퍼 못 봄
  ) t;
$$;
GRANT EXECUTE ON FUNCTION get_party_offers(UUID) TO authenticated;

-- 2) vote_offer: MD 투표 차단
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
  IF is_puzzle_md(v_puzzle_id, auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD는 투표할 수 없어요');
  END IF;

  SELECT vote INTO v_existing FROM puzzle_offer_votes
    WHERE offer_id = p_offer_id AND user_id = auth.uid();

  IF v_existing = p_vote THEN
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

-- 4) 알림 타입 추가 (Migration 354 목록 + party_md_released)
ALTER TABLE in_app_notifications DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;
ALTER TABLE in_app_notifications
  ADD CONSTRAINT in_app_notifications_type_check CHECK (type IN (
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
    'party_md_invited', 'party_removed', 'party_md_released'
  ));

-- 3) release_party_md: MD에게 상담 종료 알림 추가 (Migration 355 본문 + 알림)
CREATE OR REPLACE FUNCTION release_party_md(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle    puzzles%ROWTYPE;
  v_md_id     UUID;
  v_offer_id  UUID;
  v_md_name   TEXT;
  v_club_name TEXT;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 내보낼 수 있어요');
  END IF;

  SELECT md_id, offer_id INTO v_md_id, v_offer_id
    FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  DELETE FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
    INTO v_md_name FROM users u WHERE u.id = v_md_id;
  SELECT c.name INTO v_club_name
    FROM puzzle_offers o LEFT JOIN clubs c ON c.id = o.club_id
    WHERE o.id = v_offer_id;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
  VALUES (
    p_puzzle_id, NULL,
    btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너 상담이 종료되었어요',
    TRUE
  );

  -- MD에게 상담 종료 알림
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_md_id,
    'party_md_released',
    '상담이 종료됐어요',
    '방장이 조각 단체채팅 상담을 종료했어요.',
    '/'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION release_party_md(UUID) TO authenticated;
