-- ============================================================
-- Migration 186: notification_logs 제약 완화 — puzzle/MD 알림 허용
-- ============================================================
-- 배경: Edge Function이 puzzle/md_approved 이벤트를 INSERT 하려 하지만
-- (1) event_type CHECK 제약에 해당 값이 없어 거부됨
-- (2) auction_id가 auctions(id) FK라 puzzle.id 거부됨
-- → 알림톡은 SOLAPI로 발송되지만 DB 기록 실패 → alreadySent 체크가
--    항상 false 반환 → 매 5분마다 같은 사람에게 중복 발송 발생
--
-- 해결:
-- (a) auction_id 컬럼을 entity_id 의미로 재해석 (FK 제거)
-- (b) event_type CHECK 확장 (puzzle_*, md_approved 추가)
-- ============================================================

-- 1) auction_id FK 제거 (이제는 auction 또는 puzzle ID 모두 가능)
ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_auction_id_fkey;

-- 2) event_type CHECK 확장
ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_event_type_check;
ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_event_type_check
  CHECK (event_type IN (
    -- 기존 (Migration 050)
    'auction_started',
    'auction_won',
    'visit_confirmed',
    'outbid',
    'closing_soon',
    'noshow_penalty',
    'contact_deadline_warning',
    'fallback_won',
    -- 신규: MD 승인
    'md_approved',
    -- 신규: 깃발(puzzle)
    'puzzle_first_offer',
    'puzzle_deadline_reminder',
    'puzzle_offer_won',
    'puzzle_leader_changed',
    'puzzle_offer_reminder',
    'puzzle_matched'
  ));

COMMENT ON COLUMN notification_logs.auction_id IS
  'Entity ID (auction OR puzzle). FK 제거됨 — Migration 186';
