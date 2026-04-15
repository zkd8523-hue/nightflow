-- 099: Admin 경매 강제 취소/삭제 시 MD 인앱 알림 type 추가

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
    'auction_admin_cancelled', 'auction_admin_deleted'
  ));
