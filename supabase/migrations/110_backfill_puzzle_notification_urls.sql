-- ============================================================================
-- Migration 108: 퍼즐 알림 NULL action_url Backfill
-- 날짜: 2026-04-16
-- 설명: Migration 101 시기에 INSERT 구문이 action_url 누락된 채 생성된
--       퍼즐 알림들을 /puzzles 목록 페이지로 fallback 처리
--       (정확한 puzzle_id 매칭은 puzzle_id 컬럼 부재로 어려움)
-- ============================================================================

UPDATE in_app_notifications
SET action_url = '/puzzles'
WHERE action_url IS NULL
  AND type IN (
    'puzzle_offer_received',
    'puzzle_offer_accepted',
    'puzzle_offer_rejected',
    'puzzle_leader_changed',
    'puzzle_cancelled',
    'puzzle_seat_adjusted',
    'puzzle_member_joined'
  );
