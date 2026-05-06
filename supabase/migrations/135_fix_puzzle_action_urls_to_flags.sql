-- ============================================================================
-- Migration 135: 깃발 알림 action_url을 /puzzles/ → /flags/ 일괄 수정
-- 날짜: 2026-05-07
-- 설명:
--   깃발 리브랜딩 시 라우트가 /puzzles/[id] → /flags/[id]로 변경됐으나,
--   알림 생성 RPC 함수들은 여전히 /puzzles/{id}를 사용해서 클릭 시 404 발생.
--
--   영향 받는 함수 (모두 CREATE OR REPLACE):
--   1. submit_offer (Migration 133) — puzzle_offer_received
--   2. accept_offer (Migration 134) — puzzle_offer_accepted, puzzle_offer_rejected (others)
--   3. reject_offer (Migration 105) — puzzle_offer_rejected
--   4. join_puzzle  (Migration 105) — puzzle_member_joined
--   5. cancel_puzzle (Migration 126) — puzzle_cancelled (action_url 누락)
--   6. leave_puzzle  (Migration 126) — puzzle_leader_changed (action_url 누락)
--   7. remove_puzzle_member (Migration 126) — puzzle_seat_adjusted (action_url 누락)
--
--   추가로 DB에 박혀있는 기존 /puzzles/... 알림을 일괄 백필.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. submit_offer: MD가 깃발에 제안 → 방장 알림
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_offer(
  p_puzzle_id UUID,
  p_club_id UUID,
  p_table_type TEXT,
  p_proposed_price INTEGER,
  p_includes TEXT[],
  p_comment TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_md users%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_max_price INTEGER;
  v_current_budget INTEGER;
BEGIN
  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_md.role != 'md' THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD만 제안할 수 있습니다');
  END IF;
  IF v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 MD만 제안할 수 있습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 깃발입니다');
  END IF;
  IF v_puzzle.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', '마감된 깃발입니다');
  END IF;
  IF v_md.md_active_offers_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', '동시 활성 오퍼는 최대 3건입니다');
  END IF;

  IF v_md.md_daily_offers_reset_at IS DISTINCT FROM CURRENT_DATE THEN
    UPDATE users SET
      md_daily_offers_count = 0,
      md_daily_offers_reset_at = CURRENT_DATE
    WHERE id = auth.uid();
    v_md.md_daily_offers_count := 0;
  END IF;
  IF v_md.md_daily_offers_count >= 6 THEN
    RETURN jsonb_build_object('success', false, 'error', '일일 제안 횟수(6건)를 초과했습니다');
  END IF;

  v_current_budget := COALESCE(
    FLOOR(v_puzzle.total_budget::NUMERIC / NULLIF(v_puzzle.target_count, 0)) * v_puzzle.current_count,
    v_puzzle.budget_per_person * v_puzzle.current_count
  );
  v_max_price := CEIL(v_current_budget * 1.2);

  IF p_proposed_price < v_current_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('예산 이하로는 제안할 수 없습니다 (예산: %s원)', v_current_budget)
    );
  END IF;

  IF p_proposed_price > v_max_price THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('예산의 120%%를 초과할 수 없습니다 (최대 %s원)', v_max_price)
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid() AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 제안한 깃발입니다');
  END IF;

  INSERT INTO puzzle_offers (puzzle_id, md_id, club_id, table_type, proposed_price, includes, comment)
  VALUES (p_puzzle_id, auth.uid(), p_club_id, p_table_type, p_proposed_price, COALESCE(p_includes, '{}'), p_comment);

  UPDATE users SET
    md_active_offers_count = md_active_offers_count + 1,
    md_daily_offers_count = md_daily_offers_count + 1,
    md_daily_offers_reset_at = CURRENT_DATE
  WHERE id = auth.uid();

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_offer_received',
    'MD 제안 도착',
    'MD가 회원님의 깃발에 제안서를 보냈습니다. 확인해보세요!',
    '/flags/' || v_puzzle.id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. accept_offer: 방장이 오퍼 수락 (카카오 URL 원자 처리)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS accept_offer(UUID);
DROP FUNCTION IF EXISTS accept_offer(UUID, TEXT);

CREATE OR REPLACE FUNCTION accept_offer(
  p_offer_id UUID,
  p_kakao_open_chat_url TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_md users%ROWTYPE;
BEGIN
  IF p_kakao_open_chat_url IS NULL
     OR p_kakao_open_chat_url !~ '^https://open\.kakao\.com/o/' THEN
    RETURN jsonb_build_object('success', false, 'error', '올바른 카카오 오픈채팅 링크가 필요합니다');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id FOR UPDATE;
  SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;

  IF v_puzzle.leader_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 수락할 수 있습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 마감된 깃발입니다');
  END IF;
  IF v_md.md_credits < 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD의 크레딧이 부족합니다');
  END IF;

  UPDATE puzzle_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  UPDATE puzzle_offers
  SET status = 'expired', updated_at = now()
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'pending';

  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = v_offer.puzzle_id
      AND id != p_offer_id
      AND status = 'expired'
  );

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT md_id, 'puzzle_offer_rejected', '제안 미선택', '방장이 다른 제안을 선택했습니다.',
    '/flags/' || v_offer.puzzle_id
  FROM puzzle_offers
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'expired';

  UPDATE puzzles SET
    status = 'accepted',
    accepted_offer_id = p_offer_id,
    kakao_open_chat_url = p_kakao_open_chat_url
  WHERE id = v_offer.puzzle_id;

  UPDATE users SET
    md_credits = md_credits - 30,
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id = v_offer.md_id;

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'puzzle_offer_accepted',
    '제안 수락됨!',
    '방장이 회원님의 제안을 선택했습니다. 방장에게 직접 연락해 예약을 확정하세요.',
    '/flags/' || v_offer.puzzle_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'kakao_open_chat_url', p_kakao_open_chat_url,
    'leader_id', v_puzzle.leader_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. reject_offer: 방장이 단일 오퍼 거절
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM puzzles WHERE id = v_offer.puzzle_id AND leader_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다');
  END IF;

  UPDATE puzzle_offers
  SET status = 'rejected', updated_at = now()
  WHERE id = p_offer_id;

  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id = v_offer.md_id;

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'puzzle_offer_rejected',
    '제안 거절됨',
    '방장이 제안을 거절했습니다. 슬롯이 회복되었습니다.',
    '/flags/' || v_offer.puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. cancel_puzzle: 방장이 깃발 취소 → 참여자 알림
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;
  IF (SELECT status FROM puzzles WHERE id = p_puzzle_id) != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 종료된 깃발입니다');
  END IF;

  UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT user_id, 'puzzle_cancelled', '깃발 취소', '참여하신 깃발이 내려갔습니다.',
    '/flags/' || p_puzzle_id
  FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id AND user_id != auth.uid();

  UPDATE puzzle_offers SET status = 'expired', updated_at = now()
  WHERE puzzle_id = p_puzzle_id AND status = 'pending';

  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. remove_puzzle_member: 방장이 참여자 강제 퇴장
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION remove_puzzle_member(p_puzzle_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE v_guest INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;

  SELECT guest_count INTO v_guest FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자를 찾을 수 없습니다');
  END IF;

  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id;
  UPDATE puzzles SET current_count = current_count - (1 + COALESCE(v_guest, 0))
    WHERE id = p_puzzle_id;

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    p_user_id,
    'puzzle_seat_adjusted',
    '자리 조정 안내',
    '참여하신 깃발의 자리가 조정되었습니다.',
    '/flags/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. leave_puzzle: 멤버가 깃발 떠남 (방장이면 위임)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION leave_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_guest INTEGER;
  v_next_leader UUID;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 깃발입니다');
  END IF;

  SELECT guest_count INTO v_guest FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '참여 기록이 없습니다');
  END IF;

  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  UPDATE puzzles SET
    current_count = current_count - (1 + COALESCE(v_guest, 0))
  WHERE id = p_puzzle_id;

  IF v_puzzle.leader_id = auth.uid() THEN
    SELECT user_id INTO v_next_leader
    FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id
    ORDER BY joined_at ASC
    LIMIT 1;

    IF v_next_leader IS NOT NULL THEN
      UPDATE puzzles SET
        leader_id = v_next_leader,
        leader_changed_at = now()
      WHERE id = p_puzzle_id;

      INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
      VALUES (
        v_next_leader,
        'puzzle_leader_changed',
        '방장이 되었습니다',
        '기존 방장이 깃발을 내려 회원님이 새 방장이 되었습니다. MD 제안을 확인해보세요!',
        '/flags/' || p_puzzle_id
      );
    ELSE
      UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

      UPDATE puzzle_offers SET status = 'expired', updated_at = now()
      WHERE puzzle_id = p_puzzle_id AND status = 'pending';

      UPDATE users SET
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id IN (
        SELECT md_id FROM puzzle_offers
        WHERE puzzle_id = p_puzzle_id AND status = 'expired'
          AND updated_at > now() - INTERVAL '1 second'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. join_puzzle: 멤버 참여 → 방장 알림
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION join_puzzle(p_puzzle_id UUID, p_guest_count INTEGER DEFAULT 0)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_total INTEGER;
  v_u users%ROWTYPE;
BEGIN
  v_total := 1 + GREATEST(p_guest_count, 0);
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  SELECT * INTO v_u FROM users WHERE id = auth.uid();

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 깃발입니다');
  END IF;
  IF v_puzzle.current_count + v_total > v_puzzle.target_count THEN
    RETURN jsonb_build_object('success', false, 'error', '남은 자리가 부족합니다');
  END IF;
  IF v_puzzle.leader_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인이 만든 깃발입니다');
  END IF;
  IF EXISTS (SELECT 1 FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 참여한 깃발입니다');
  END IF;

  INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
    VALUES (p_puzzle_id, auth.uid(), GREATEST(p_guest_count, 0));
  UPDATE puzzles SET current_count = current_count + v_total WHERE id = p_puzzle_id;

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_member_joined',
    '새로운 참여자!',
    v_u.name || '님이 깃발에 참여했습니다. 인원을 확인해보세요!',
    '/flags/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true, 'current_count', v_puzzle.current_count + v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. 백필: 기존 DB의 /puzzles/... 알림을 /flags/...로 변경
-- ────────────────────────────────────────────────────────────────────────────
UPDATE in_app_notifications
SET action_url = REPLACE(action_url, '/puzzles/', '/flags/')
WHERE action_url LIKE '/puzzles/%';
