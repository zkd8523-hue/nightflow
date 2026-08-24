-- ============================================================================
-- Migration 543: 쿠폰 취소 알림 type 허용 + 취소 실패 수정
-- 날짜: 2026-08-24
-- 선행: 539_partner_coupons.sql
--
-- 문제:
--   cancel_coupon_issue()가 보유자에게 인앱 알림을 넣을 때
--   type = 'coupon_revoked' 를 쓰는데, in_app_notifications_type_check 에
--   그 값이 없어 CHECK 위반으로 취소 전체가 롤백됐다.
--   → MD 화면에서 "취소 실패"만 뜨고 원인을 알 수 없었다.
--
-- 조치:
--   492의 허용 목록을 그대로 승계하고 'coupon_revoked' 만 추가한다.
--   (목록 전체를 다시 나열해야 한다 — CHECK는 부분 수정이 불가능)
--
-- 실행: Supabase 대시보드 SQL Editor에 붙여넣어 1회 실행. db push 금지.
-- ============================================================================

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
    'puzzle_promoted_to_flag',
    'offer_withdrawn_by_admin',
    'admin_puzzle_expired', 'admin_puzzle_cancelled',
    'admin_match_expired', 'admin_match_cancelled',
    'chat_reply',
    'party_md_invited', 'party_removed', 'party_md_released',
    'dm_request', 'dm_accepted',
    'credit_charged',
    'admin_visit_review_pending', 'admin_review_delete_request',
    -- 신규 (543): 쿠폰 발행 취소로 보유분이 무효화될 때
    'coupon_revoked'
  ));

-- ============================================================================
-- cancel_coupon_issue 재정의 — 알림 실패가 취소 자체를 막지 않도록 방어
--   알림은 부가 기능이다. 여기서 예외가 나도 "쿠폰 취소"라는 본질적 작업은
--   성공해야 한다. 위 CHECK 추가로 원인은 해소되지만, 앞으로 알림 스키마가
--   또 바뀌어도 취소가 막히지 않도록 EXCEPTION 블록으로 감싼다.
-- ============================================================================
CREATE OR REPLACE FUNCTION cancel_coupon_issue(
  p_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_issue coupon_issues%ROWTYPE;
  v_revoked_count INT;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;

  SELECT * INTO v_issue FROM coupon_issues WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '쿠폰을 찾을 수 없어요');
  END IF;
  IF v_issue.md_id <> v_md_id AND v_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 쿠폰만 취소할 수 있어요');
  END IF;
  IF v_issue.status NOT IN ('active', 'sold_out') THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 종료된 쿠폰이에요');
  END IF;

  UPDATE coupon_issues SET status = 'cancelled' WHERE id = p_id;

  UPDATE coupon_claims
     SET status = 'revoked'
   WHERE issue_id = p_id AND status = 'active';
  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  -- 보유자 알림. 실패해도 취소 자체는 유지한다.
  BEGIN
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    SELECT user_id, 'coupon_revoked', '쿠폰이 취소됐어요',
           v_issue.title || ' 쿠폰이 발행자에 의해 취소됐어요', '/my-coupons'
      FROM coupon_claims
     WHERE issue_id = p_id AND status = 'revoked';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'revoked_count', v_revoked_count);
END;
$$;

COMMENT ON FUNCTION cancel_coupon_issue(UUID, TEXT) IS
  '쿠폰 발행 취소 (본인/admin). 미사용 claim은 revoked, 이미 사용된 건은 보존. 알림 실패는 무시';

-- ============================================================================
-- delete_coupon_issue — 지난 쿠폰 목록에서 완전히 지우기
--   "다시 발행"의 원본이 되는 목록이 계속 쌓이므로 정리 수단이 필요하다.
--   단 사용 이력이 있는 건은 지우지 않는다 — coupon_claims가 CASCADE로 함께
--   날아가면 유저의 사용 기록과 분쟁 대조용 nonce까지 사라진다.
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_coupon_issue(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_issue coupon_issues%ROWTYPE;
  v_redeemed INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_uid;

  SELECT * INTO v_issue FROM coupon_issues WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '쿠폰을 찾을 수 없어요');
  END IF;
  IF v_issue.md_id <> v_uid AND v_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 쿠폰만 삭제할 수 있어요');
  END IF;

  -- 진행 중인 쿠폰은 먼저 취소해야 한다 (보유자에게 알림이 나가야 하므로)
  IF v_issue.status IN ('active', 'sold_out') THEN
    RETURN jsonb_build_object('success', false, 'error', '진행 중인 쿠폰은 취소 후 삭제할 수 있어요');
  END IF;

  -- 사용 이력 보존
  SELECT COUNT(*) INTO v_redeemed
    FROM coupon_claims
   WHERE issue_id = p_id AND redeemed_at IS NOT NULL;
  IF v_redeemed > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('%s명이 사용한 기록이 있어 삭제할 수 없어요', v_redeemed)
    );
  END IF;

  DELETE FROM coupon_issues WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION delete_coupon_issue(UUID) IS
  '지난 쿠폰 완전 삭제 (본인/admin). 진행 중이거나 사용 이력이 있으면 거부';
