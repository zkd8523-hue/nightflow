-- ============================================================================
-- Migration 430: get_party_chats — 만료된 조각도 채팅방은 유지
-- 날짜: 2026-07-09
-- 배경:
--   MD 직통 조각의 오퍼 마감(20 KST)/만료(expires_at=이벤트 당일 21 KST) 이후
--   자동 만료 크론이 status='expired'로 전환 → 기존 get_party_chats가 expired를
--   제외하면서, 정작 "그날 밤 만나서 노는" 파티의 단체 채팅이 이벤트 당일 밤에
--   사라져버리는 문제.
-- 해결:
--   오퍼는 마감돼도 채팅은 유지. 단 오래 전 죽은 조각이 목록에 영원히 쌓이지 않게,
--   expired는 "이벤트 최근분(당일~2일 이내, KST)"까지만 유지.
--   cancelled(방장이 내림)는 기존대로 제외.
--   (412 본문 + status 필터만 수정)
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
      EXISTS (
        SELECT 1 FROM puzzle_party_messages m2
        WHERE m2.puzzle_id = p.id
          AND m2.is_deleted = false
          AND m2.is_system = false
          AND m2.sender_id IS DISTINCT FROM auth.uid()
          AND m2.created_at > COALESCE(
            (SELECT r.last_read_at FROM puzzle_party_reads r
              WHERE r.puzzle_id = p.id AND r.user_id = auth.uid()),
            'epoch'::timestamptz)
      ) AS unread
    FROM puzzles p
    LEFT JOIN clubs c ON c.id = p.club_id
    LEFT JOIN LATERAL (
      SELECT content, created_at, sender_id
      FROM puzzle_party_messages
      WHERE puzzle_id = p.id AND is_deleted = false
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    WHERE p.is_recruiting_party = true
      AND p.status <> 'cancelled'
      -- expired는 완전 제외하지 않고, 이벤트 당일~2일 이내(KST)까지 채팅 유지
      AND (
        p.status <> 'expired'
        OR p.event_date >= ((now() AT TIME ZONE 'Asia/Seoul')::date - 2)
      )
      AND is_party_participant(p.id, auth.uid())
  ) t;
$$;
GRANT EXECUTE ON FUNCTION get_party_chats() TO authenticated;
