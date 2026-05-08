-- ============================================================================
-- Migration 141: in_app_notifications 타입 제약에 offer_withdrawn_by_admin 추가
-- 날짜: 2026-05-08
-- 설명: Migration 140의 admin_withdraw_offer()가 'offer_withdrawn_by_admin'
--       type으로 알림을 INSERT하는데, Migration 105의 CHECK 제약에 포함되지
--       않아 실패. 제약을 확장하여 신규 type 허용.
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
    'offer_withdrawn_by_admin'
  ));
