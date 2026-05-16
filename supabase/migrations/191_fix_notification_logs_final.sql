-- ============================================================
-- Migration 187: notification_logs 최종 수정 (중복 발송 방지)
-- ============================================================
-- (1) auction_id NOT NULL 제약 제거 (puzzle 알림 시 null 허용)
-- (2) auction_id FK 제거 (이제는 entity_id 의미로도 사용)
-- (3) event_type CHECK 확장 (puzzle_*, md_approved 추가)
-- (4) puzzle_id 컬럼 및 인덱스 보장
-- ============================================================

-- 1) auction_id NOT NULL 제거 및 FK 제거
ALTER TABLE notification_logs 
  ALTER COLUMN auction_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS notification_logs_auction_id_fkey;

-- 2) puzzle_id 컬럼 보장 (Migration 102에서 추가됐을 수 있으나 확실히 함)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_logs' AND column_name='puzzle_id') THEN
        ALTER TABLE notification_logs ADD COLUMN puzzle_id UUID REFERENCES puzzles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3) event_type CHECK 확장
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
    -- 신규
    'md_approved',
    'puzzle_first_offer',
    'puzzle_deadline_reminder',
    'puzzle_leader_changed',
    'puzzle_matched',
    'puzzle_offer_won',
    'puzzle_offer_reminder'
  ));

-- 4) 인덱스
CREATE INDEX IF NOT EXISTS idx_notify_logs_puzzle_v2
  ON notification_logs(puzzle_id, event_type, status);

-- 5) 백필: 이미 발송된 puzzle_first_offer 4건을 기록 (재발송 방지)
-- 현재 스팸 중인 4명의 리더에 대해 기록을 남겨 alreadySent가 true가 되게 함
INSERT INTO notification_logs 
  (event_type, puzzle_id, recipient_user_id, recipient_phone, template_id, status, created_at)
SELECT DISTINCT 
  'puzzle_first_offer', p.id, p.leader_id, u.phone,
  'KA01TP260423210327921pKKscNcbkyl', 'sent', now()
FROM puzzles p
JOIN users u ON u.id = p.leader_id
WHERE p.status = 'open'
  AND EXISTS (SELECT 1 FROM puzzle_offers WHERE puzzle_id = p.id AND status = 'pending')
  AND u.phone IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON TABLE notification_logs IS '알림 발송 로그 (auction_id 또는 puzzle_id 중 하나는 필수)';
