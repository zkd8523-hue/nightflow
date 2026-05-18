-- ============================================================================
-- Migration 197: notify_and_expire_puzzles() 폐기 및 CHECK 제약 확장
-- 날짜: 2026-05-18
-- 설명:
--   Migration 170에서 정의한 notify_and_expire_puzzles() 는
--   (1) 실제 호출처가 없고
--   (2) 존재하지 않는 `notifications` 테이블(실제는 in_app_notifications)을 참조함
--   책임을 Edge Function (notify-puzzle-events + expire-puzzles)로 이관하면서
--   SQL 함수는 정리.
--   추가로, notify-puzzle-events에서 사용하는 'puzzle_offer_deadline'
--   이벤트 타입이 notification_logs.event_type CHECK 제약에 포함되어 있지 않아
--   발송/실패 로그 작성 시 에러가 발생하는 문제를 해결하기 위해 CHECK 제약 수정.
-- ============================================================================

DROP FUNCTION IF EXISTS notify_and_expire_puzzles();

-- notification_logs event_type CHECK 확장 ('puzzle_offer_deadline' 추가)
ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_event_type_check;
ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_event_type_check
  CHECK (event_type IN (
    -- 기존
    'auction_started',
    'auction_won',
    'payment_completed',
    'visit_confirmed',
    'outbid',
    'closing_soon',
    'noshow_penalty',
    'contact_deadline_warning',
    'fallback_won',
    'earlybird_dday_reminder',
    'auction_contact_expired',
    'new_auction_in_area',
    -- 신규 (191번)
    'md_approved',
    'puzzle_first_offer',
    'puzzle_deadline_reminder',
    'puzzle_leader_changed',
    'puzzle_matched',
    'puzzle_offer_won',
    'puzzle_offer_reminder',
    -- 추가된 마감 이벤트 타입
    'puzzle_offer_deadline'
  ));
