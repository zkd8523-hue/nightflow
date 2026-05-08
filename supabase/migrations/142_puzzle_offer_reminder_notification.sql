-- Migration 142: puzzle_offer_reminder 알림 이벤트 타입 추가
-- D-2 19:00 KST, 미수락 시크릿 오퍼 리마인더

ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_event_type_check;

ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_event_type_check
  CHECK (event_type IN (
    'auction_started', 'auction_won', 'visit_confirmed', 'outbid',
    'closing_soon', 'noshow_penalty', 'contact_deadline_warning',
    'fallback_won', 'earlybird_dday_reminder', 'auction_contact_expired',
    'new_auction_in_area',
    'puzzle_first_offer',
    'puzzle_deadline_reminder',
    'puzzle_leader_changed',
    'puzzle_matched',
    'puzzle_offer_won',
    'puzzle_offer_reminder'
  ));
