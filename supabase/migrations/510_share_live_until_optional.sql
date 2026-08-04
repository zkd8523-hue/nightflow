-- ============================================================================
-- Migration 510: 상시 조각 종료일을 선택값으로 (505/506 후속)
-- 날짜: 2026-08-05
-- 배경:
--   상시 조각의 취지는 "한 번 켜두면 계속 굴러가는 것"인데, 종료일을 필수(최대 4주)로
--   두는 바람에 4주마다 MD가 다시 손을 대야 했다. set-and-forget이 되지 못한다.
--
--   좀비 공급(실제로는 없는 자리를 계속 발행)은 sweep_live_shares()의
--   empty_streak 자동 OFF(참여 0인 발행 3회 연속)가 이미 막는다. 종료일은
--   "이 날까지만 하고 싶다"는 MD의 선택지로만 남긴다.
--
--   → is_live=true여도 live_until은 NULL 허용(무기한). 요일만 반드시 있어야 한다.
-- ============================================================================

ALTER TABLE auction_templates DROP CONSTRAINT IF EXISTS chk_auction_templates_live;
ALTER TABLE auction_templates ADD CONSTRAINT chk_auction_templates_live
  CHECK (
    is_live = false
    OR COALESCE(array_length(live_dows, 1), 0) > 0
  );

COMMENT ON COLUMN auction_templates.live_until IS
  '상시 운영 종료일(선택). NULL이면 무기한 — MD가 끄거나 sweep_live_shares()의 자동 OFF까지 계속.';
