-- ============================================================================
-- Migration 105: 퍼즐 알림 딥링크(Deep Linking) 강화
-- 날짜: 2026-04-16
-- 설명: 퍼즐 관련 모든 인앱 알림에 action_url을 추가하여 클릭 시 상세 페이지로 이동하도록 개선
-- ============================================================================

-- 1. in_app_notifications 타입 제약 확장 (puzzle_member_joined 추가)
ALTER TABLE in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

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
    'puzzle_leader_changed', 'puzzle_member_joined'
  ));

-- 2. submit_offer() 수정: 방장 알림에 링크 추가
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
  v_base_budget INTEGER;
BEGIN
  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '퍼즐을 찾을 수 없습니다');
  END IF;
  IF v_md.role != 'md' THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD만 제안할 수 있습니다');
  END IF;
  IF v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 MD만 제안할 수 있습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 퍼즐입니다');
  END IF;
  IF v_puzzle.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', '마감된 퍼즐입니다');
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

  v_base_budget := COALESCE(v_puzzle.total_budget, v_puzzle.budget_per_person * v_puzzle.target_count);
  v_max_price := CEIL(v_base_budget * 1.3);
  IF p_proposed_price > v_max_price THEN
    RETURN jsonb_build_object('success', false, 'error', format('예산의 130%%를 초과할 수 없습니다 (최대 %s원)', v_max_price));
  END IF;

  IF EXISTS (SELECT 1 FROM puzzle_offers WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid() AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 제안한 퍼즐입니다');
  END IF;

  INSERT INTO puzzle_offers (puzzle_id, md_id, club_id, table_type, proposed_price, includes, comment)
  VALUES (p_puzzle_id, auth.uid(), p_club_id, p_table_type, p_proposed_price, COALESCE(p_includes, '{}'), p_comment);

  UPDATE users SET
    md_active_offers_count = md_active_offers_count + 1,
    md_daily_offers_count = md_daily_offers_count + 1,
    md_daily_offers_reset_at = CURRENT_DATE
  WHERE id = auth.uid();

  -- 방장에게 알림 + 링크 추가
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_offer_received',
    'MD 제안 도착',
    'MD가 회원님의 퍼즐에 제안서를 보냈습니다. 확인해보세요!',
    '/puzzles/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. reject_offer() 수정: MD 알림에 링크 추가
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

  -- MD에게 알림 + 링크 추가
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'puzzle_offer_rejected',
    '제안 거절됨',
    '방장이 제안을 거절했습니다. 슬롯이 회복되었습니다.',
    '/puzzles/' || v_offer.puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. leave_puzzle() 수정: 새 방장 알림에 링크 추가
CREATE OR REPLACE FUNCTION leave_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_guest INTEGER;
  v_next_leader UUID;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '퍼즐을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' AND v_puzzle.status != 'matched' THEN
    RETURN jsonb_build_object('success', false, 'error', '수정 가능한 상태의 퍼즐이 아닙니다');
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

      -- 새 방장에게 알림 + 링크 추가
      INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
      VALUES (
        v_next_leader,
        'puzzle_leader_changed',
        '방장이 되었습니다',
        '기존 방장이 퍼즐을 떠나 회원님이 새 방장이 되었습니다. MD 제안을 확인해보세요!',
        '/puzzles/' || p_puzzle_id
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

-- 5. cancel_puzzle() 수정: 참여자 알림에 링크 추가
CREATE OR REPLACE FUNCTION cancel_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;
  IF (SELECT status FROM puzzles WHERE id = p_puzzle_id) IN ('cancelled', 'expired') THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 종료되었거나 취소된 퍼즐입니다');
  END IF;

  UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

  -- 참여자 전원 알림 + 링크 추가
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT user_id, 'puzzle_cancelled', '퍼즐 취소', '참여하신 퍼즐이 취소되었습니다.',
    '/puzzles/' || p_puzzle_id
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

-- 6. remove_puzzle_member() 수정: 알림에 링크 추가
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

  -- 알림 + 링크 추가
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      p_user_id,
      'puzzle_seat_adjusted',
      '자리 조정 안내',
      '참여하신 퍼즐의 자리가 조정되었습니다.',
      '/puzzles/' || p_puzzle_id
    );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. join_puzzle() 수정: 방장에게 알림 추가 [NEW]
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

  INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
    VALUES (p_puzzle_id, auth.uid(), GREATEST(p_guest_count, 0));
  UPDATE puzzles SET current_count = current_count + v_total WHERE id = p_puzzle_id;

  -- 방장에게 알림 발송 [NEW]
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_member_joined',
    '새로운 참여자!',
    v_u.name || '님이 퍼즐에 참여했습니다. 인원을 확인해보세요!',
    '/puzzles/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true, 'current_count', v_puzzle.current_count + v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
