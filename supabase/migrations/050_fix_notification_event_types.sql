-- Migration 050: notification_logs event_type 제약조건 수정
-- Model B 반영: payment_completed, payment_reminder 제거
-- 신규 추가: closing_soon, noshow_penalty, contact_deadline_warning, fallback_won

ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_event_type_check;
ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_event_type_check
  CHECK (event_type IN (
    'auction_started',
    'auction_won',
    'visit_confirmed',
    'outbid',
    'closing_soon',
    'noshow_penalty',
    'contact_deadline_warning',
    'fallback_won'
  ));

-- in_app_notifications type도 확장
ALTER TABLE in_app_notifications DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;
ALTER TABLE in_app_notifications ADD CONSTRAINT in_app_notifications_type_check
  CHECK (type IN (
    'md_approved',
    'md_rejected',
    'outbid',
    'auction_won',
    'contact_deadline_warning',
    'noshow_penalty',
    'fallback_won'
  ));
