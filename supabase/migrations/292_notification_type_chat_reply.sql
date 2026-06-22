-- Migration 292: in_app_notifications.type CHECK에 'chat_reply' 추가
-- - Migration 291의 notify_chat_reply 트리거가 type='chat_reply'로 INSERT
-- - 기존 CHECK 제약(Migration 219 기준)에 chat_reply가 없어서 위반 발생

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
    -- ▼ 와글 답글 알림 (Migration 291)
    'chat_reply'
  ));
