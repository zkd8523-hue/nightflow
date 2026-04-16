-- ============================================================================
-- Migration 111: 퍼즐 알림 action_url 재수정
-- 날짜: 2026-04-16
-- 설명: Migration 110이 /puzzles로 backfill 했으나 해당 라우트가 존재하지 않아 404 발생
--       퍼즐 진입점은 홈(/) 또는 /puzzles/{id} 상세 페이지뿐
--       1차: notification.user_id 기반으로 정확한 puzzle_id 매칭 시도
--       2차: 매칭 실패 시 홈(/)으로 fallback (홈에 퍼즐 섹션 존재)
-- ============================================================================

-- 1. puzzle_offer_received: user_id = puzzle.leader_id 매칭
--    한 leader가 여러 puzzle을 가질 수 있으므로 created_at 가까운 것 선택
UPDATE in_app_notifications n
SET action_url = '/puzzles/' || p.id
FROM puzzles p
WHERE n.type = 'puzzle_offer_received'
  AND n.action_url IN ('/puzzles', '/puzzles/')
  AND p.leader_id = n.user_id
  AND p.id = (
    SELECT p2.id FROM puzzles p2
    WHERE p2.leader_id = n.user_id
      AND p2.created_at <= n.created_at
    ORDER BY p2.created_at DESC
    LIMIT 1
  );

-- 2. puzzle_leader_changed: user_id = 새 방장
UPDATE in_app_notifications n
SET action_url = '/puzzles/' || p.id
FROM puzzles p
WHERE n.type = 'puzzle_leader_changed'
  AND n.action_url IN ('/puzzles', '/puzzles/')
  AND p.leader_id = n.user_id
  AND p.id = (
    SELECT p2.id FROM puzzles p2
    WHERE p2.leader_id = n.user_id
      AND p2.leader_changed_at IS NOT NULL
      AND p2.leader_changed_at <= n.created_at
    ORDER BY p2.leader_changed_at DESC
    LIMIT 1
  );

-- 3. puzzle_offer_accepted/rejected: user_id = MD, puzzle_offers 통해 매칭
UPDATE in_app_notifications n
SET action_url = '/puzzles/' || po.puzzle_id
FROM puzzle_offers po
WHERE n.type IN ('puzzle_offer_accepted', 'puzzle_offer_rejected')
  AND n.action_url IN ('/puzzles', '/puzzles/')
  AND po.md_id = n.user_id
  AND po.id = (
    SELECT po2.id FROM puzzle_offers po2
    WHERE po2.md_id = n.user_id
      AND po2.created_at <= n.created_at
    ORDER BY po2.created_at DESC
    LIMIT 1
  );

-- 4. puzzle_cancelled, puzzle_seat_adjusted, puzzle_member_joined: 멤버에게 가는 알림
--    puzzle_members 통해 매칭
UPDATE in_app_notifications n
SET action_url = '/puzzles/' || pm.puzzle_id
FROM puzzle_members pm
WHERE n.type IN ('puzzle_cancelled', 'puzzle_seat_adjusted', 'puzzle_member_joined')
  AND n.action_url IN ('/puzzles', '/puzzles/')
  AND pm.user_id = n.user_id
  AND pm.puzzle_id = (
    SELECT pm2.puzzle_id FROM puzzle_members pm2
    WHERE pm2.user_id = n.user_id
      AND pm2.joined_at <= n.created_at
    ORDER BY pm2.joined_at DESC
    LIMIT 1
  );

-- 5. 매칭 실패한 나머지 → 홈(/)으로 fallback (홈에 퍼즐 섹션 노출됨)
UPDATE in_app_notifications
SET action_url = '/'
WHERE action_url IN ('/puzzles', '/puzzles/')
  AND type IN (
    'puzzle_offer_received',
    'puzzle_offer_accepted',
    'puzzle_offer_rejected',
    'puzzle_leader_changed',
    'puzzle_cancelled',
    'puzzle_seat_adjusted',
    'puzzle_member_joined'
  );
