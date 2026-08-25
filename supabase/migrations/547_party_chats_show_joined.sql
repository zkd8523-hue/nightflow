-- ============================================================================
-- Migration 547: 합류한 파티는 대화가 없어도 채팅 목록에 뜬다
-- 날짜: 2026-08-25
-- 배경:
--   522에서 "실제 대화가 한 건이라도 있는 방"만 목록에 노출하도록 막았다.
--   목적은 MD 자동 발행 조각(505/507)이 만드는 빈 방 도배 차단이었는데,
--   유저가 파티에 합류해도 아무도 말을 걸기 전까지 채팅 → 파티 탭이 비어 있어
--   "합류가 된 건지" 확인할 방법이 없어졌다. (합류 직후 이탈로 이어짐)
--
--   빈 방 도배는 "참가자가 방장뿐인 방"이 원인이므로, 조건을 그쪽으로 좁힌다:
--     노출 = 실제 대화가 있다  OR  방장 말고 합류한 멤버가 한 명이라도 있다
--   → 아무도 안 들어온 자동 발행 조각은 여전히 안 뜨고(522 목적 유지),
--     내가 합류한 순간 나와 방장 양쪽 목록에 방이 나타난다.
--
--   522 본문 그대로 + EXISTS 조건 한 줄 추가.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_party_chats()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.last_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      p.id                AS puzzle_id,
      p.area              AS area,
      p.notes             AS notes,
      p.event_date        AS event_date,
      COALESCE(p.total_budget, p.budget_per_person * p.target_count) AS budget,
      p.current_count     AS member_count,
      p.target_count      AS target_count,
      c.thumbnail_url     AS club_thumbnail,
      (p.leader_id = auth.uid()) AS is_leader,
      p.status            AS puzzle_status,
      COALESCE(lm.content, '단체채팅이 열렸어요') AS last_content,
      COALESCE(lm.created_at, p.created_at) AS last_at,
      lm.sender_id        AS last_sender_id,
      ur.cnt              AS unread_count,
      (ur.cnt > 0)        AS unread
    FROM puzzles p
    LEFT JOIN clubs c ON c.id = p.club_id
    LEFT JOIN LATERAL (
      SELECT content, created_at, sender_id
      FROM puzzle_party_messages
      WHERE puzzle_id = p.id AND is_deleted = false
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INT AS cnt
      FROM puzzle_party_messages m2
      WHERE m2.puzzle_id = p.id
        AND m2.is_deleted = false
        AND m2.is_system = false                     -- 시스템 메시지 제외(360)
        AND m2.sender_id IS DISTINCT FROM auth.uid()
        AND m2.created_at > COALESCE(
          (SELECT r.last_read_at FROM puzzle_party_reads r
            WHERE r.puzzle_id = p.id AND r.user_id = auth.uid()),
          'epoch'::timestamptz)
    ) ur ON true
    WHERE p.is_recruiting_party = true
      AND p.status <> 'cancelled'
      -- expired는 완전 제외하지 않고, 이벤트 당일~2일 이내(KST)까지 채팅 유지
      AND (
        p.status <> 'expired'
        OR p.event_date >= ((now() AT TIME ZONE 'Asia/Seoul')::date - 2)
      )
      AND is_party_participant(p.id, auth.uid())
      -- 대화가 시작됐거나(522), 방장 외 합류 멤버가 있는 방(547)만 목록에 노출.
      -- 아무도 안 들어온 자동 발행 조각의 빈 방은 계속 숨긴다.
      AND (
        EXISTS (
          SELECT 1 FROM puzzle_party_messages m3
          WHERE m3.puzzle_id = p.id
            AND m3.is_deleted = false
            AND m3.is_system = false
        )
        OR EXISTS (
          SELECT 1 FROM puzzle_members pm
          WHERE pm.puzzle_id = p.id
            AND pm.user_id IS DISTINCT FROM p.leader_id
        )
      )
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_party_chats() TO authenticated;

COMMENT ON FUNCTION get_party_chats() IS
  '조각 단체방 목록 + 안읽음 개수. 대화가 있거나 방장 외 합류 멤버가 있는 방만 노출(Migration 547).';
