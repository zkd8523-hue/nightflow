-- Migration 158: MD가 "연락 못받았어요"로 마킹할 수 있는 RPC
-- 시나리오: MD가 오퍼 수락받았지만 방장과 연락이 닿지 않음 → 거래 실패 처리
-- - visit_result = 'noshow'
-- - deal_count_total 증가 X (거래 실패니까)
-- - MD 크레딧 30 즉시 환불 (오퍼 수락 시 차감된 만큼)
-- - 방장에게 통보: 관리자가 패널티 검토 중
-- - admin strike 검토 큐에 들어감 (strike_applied_at NULL)

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) in_app_notifications type CHECK 확장
--    Migration 146 이후 puzzle_visit_pending/confirmed 타입을 쓰지만
--    CHECK constraint에는 빠져 있어서 INSERT 실패 → 여기서 보강
-- ─────────────────────────────────────────────────────────────────────────────
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
    'puzzle_leader_changed', 'puzzle_member_joined',
    'puzzle_visit_pending', 'puzzle_visit_confirmed',
    'offer_withdrawn_by_admin'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) mark_puzzle_noshow RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_puzzle_noshow(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_caller UUID := auth.uid();
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  -- 권한: MD 본인만
  IF v_caller != v_offer.md_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD만 마킹할 수 있습니다');
  END IF;

  IF v_offer.status != 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', '수락된 오퍼만 마킹할 수 있습니다');
  END IF;

  IF v_offer.visit_marked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 마킹된 거래입니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;

  -- noshow 마킹: visit_result = 'noshow'
  UPDATE puzzle_offers
  SET visit_result = 'noshow',
      visit_marked_at = now(),
      visit_requested_by = v_caller,
      visit_requested_at = now(),
      updated_at = now()
  WHERE id = p_offer_id;

  -- MD 크레딧 즉시 환불 (오퍼 수락 시 차감된 30 크레딧)
  UPDATE users
  SET md_credits = md_credits + 30
  WHERE id = v_offer.md_id;

  -- 방장에게 통보: 관리자 검토 중
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_visit_pending',
    '연락 미수신 신고',
    'MD가 연락을 못 받았다고 표시했습니다. 관리자가 패널티를 검토합니다.',
    '/flags/' || v_puzzle.id
  );

  RETURN jsonb_build_object('success', true, 'credits_refunded', 30);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION mark_puzzle_noshow(UUID) IS
  'MD가 수락된 오퍼에 대해 "연락 못받았어요" 표시. visit_result=noshow, MD 크레딧 30 환불, deal_count 증가 X, admin strike 검토 큐 진입.';
