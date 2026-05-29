-- ============================================================================
-- Migration 271: Migration 270 롤백
--
-- last_seen_at은 "마지막 접속"(로그인/앱 사용) 시각이어야 하는데
-- 270에서 행동(깃발 등록·참여·입찰·조각 클릭)으로도 갱신되도록 잘못 묶었음.
-- → 트리거 제거. last_seen_at은 다시 클라이언트 touch_last_seen()만 갱신.
-- ============================================================================

DROP TRIGGER IF EXISTS puzzles_touch_last_seen ON puzzles;
DROP TRIGGER IF EXISTS puzzle_members_touch_last_seen ON puzzle_members;
DROP TRIGGER IF EXISTS share_join_clicks_touch_last_seen ON share_join_clicks;
DROP TRIGGER IF EXISTS bids_touch_last_seen ON bids;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'puzzle_offers') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS puzzle_offers_touch_last_seen ON puzzle_offers';
  END IF;
END $$;

DROP FUNCTION IF EXISTS trg_puzzles_touch_last_seen();
DROP FUNCTION IF EXISTS trg_puzzle_members_touch_last_seen();
DROP FUNCTION IF EXISTS trg_puzzle_offers_touch_last_seen();
DROP FUNCTION IF EXISTS trg_share_join_clicks_touch_last_seen();
DROP FUNCTION IF EXISTS trg_bids_touch_last_seen();

-- touch_user_last_seen() 헬퍼는 다른 곳에서 안 쓰니 함께 제거
DROP FUNCTION IF EXISTS touch_user_last_seen(UUID);
