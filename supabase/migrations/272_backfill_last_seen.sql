-- ============================================================================
-- Migration 272: users.last_seen_at 백필
--
-- 270 트리거가 271에서 롤백되어 last_seen_at은 다시 "접속" 의미로 돌아왔지만,
-- 기존에 클라이언트 throttle/마운트 누락으로 잘못 표시된 값들이 남아있음.
--
-- 정책: 활동 기록이 있는데 last_seen_at이 그보다 오래된 경우 → 최근 활동 시각으로 보정.
--       (활동했다면 어느 시점이든 한 번은 접속했다는 합리적 가정)
--
-- 대상 활동: puzzles.created_at, puzzle_members.joined_at(or created_at),
--           puzzle_offers.created_at, bids.bid_at, share_join_clicks.clicked_at
--
-- 1회성 백필 — 트리거가 아니라 단발 UPDATE.
-- ============================================================================

DO $$
DECLARE
  has_pm_created BOOLEAN;
  has_pm_joined BOOLEAN;
  has_offers BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='puzzle_members' AND column_name='created_at'
  ) INTO has_pm_created;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='puzzle_members' AND column_name='joined_at'
  ) INTO has_pm_joined;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name='puzzle_offers'
  ) INTO has_offers;

  -- 1) puzzles
  UPDATE users u
  SET last_seen_at = sub.last_activity
  FROM (
    SELECT leader_id AS user_id, MAX(created_at) AS last_activity
    FROM puzzles
    WHERE leader_id IS NOT NULL
    GROUP BY leader_id
  ) sub
  WHERE u.id = sub.user_id
    AND (u.last_seen_at IS NULL OR u.last_seen_at < sub.last_activity);

  -- 2) puzzle_members (joined_at 우선, 없으면 created_at)
  IF has_pm_joined THEN
    UPDATE users u
    SET last_seen_at = sub.last_activity
    FROM (
      SELECT user_id, MAX(joined_at) AS last_activity
      FROM puzzle_members
      WHERE user_id IS NOT NULL
      GROUP BY user_id
    ) sub
    WHERE u.id = sub.user_id
      AND (u.last_seen_at IS NULL OR u.last_seen_at < sub.last_activity);
  ELSIF has_pm_created THEN
    UPDATE users u
    SET last_seen_at = sub.last_activity
    FROM (
      SELECT user_id, MAX(created_at) AS last_activity
      FROM puzzle_members
      WHERE user_id IS NOT NULL
      GROUP BY user_id
    ) sub
    WHERE u.id = sub.user_id
      AND (u.last_seen_at IS NULL OR u.last_seen_at < sub.last_activity);
  END IF;

  -- 3) puzzle_offers (오퍼 전송자 = MD)
  IF has_offers THEN
    EXECUTE $sql$
      UPDATE users u
      SET last_seen_at = sub.last_activity
      FROM (
        SELECT md_id AS user_id, MAX(created_at) AS last_activity
        FROM puzzle_offers
        WHERE md_id IS NOT NULL
        GROUP BY md_id
      ) sub
      WHERE u.id = sub.user_id
        AND (u.last_seen_at IS NULL OR u.last_seen_at < sub.last_activity)
    $sql$;
  END IF;

  -- 4) bids (조각 입찰)
  UPDATE users u
  SET last_seen_at = sub.last_activity
  FROM (
    SELECT bidder_id AS user_id, MAX(bid_at) AS last_activity
    FROM bids
    WHERE bidder_id IS NOT NULL
    GROUP BY bidder_id
  ) sub
  WHERE u.id = sub.user_id
    AND (u.last_seen_at IS NULL OR u.last_seen_at < sub.last_activity);

  -- 5) share_join_clicks (조각 참여 클릭)
  UPDATE users u
  SET last_seen_at = sub.last_activity
  FROM (
    SELECT user_id, MAX(clicked_at) AS last_activity
    FROM share_join_clicks
    WHERE user_id IS NOT NULL
    GROUP BY user_id
  ) sub
  WHERE u.id = sub.user_id
    AND (u.last_seen_at IS NULL OR u.last_seen_at < sub.last_activity);
END $$;
