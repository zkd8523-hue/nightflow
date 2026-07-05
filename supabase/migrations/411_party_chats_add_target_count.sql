-- ============================================================================
-- Migration 411: get_party_chats — target_count 추가 (현재/목표 인원 표시)
-- 날짜: 2026-07-06
-- 설명: 나의 채팅 "조각" 탭 헤더의 "N명"을 "현재/목표명"으로 보여주기 위해
--       target_count를 결과에 포함. (410 본문 + target_count만 추가)
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
    LEFT JOIN LATERAL (
      SELECT content, created_at, sender_id
      FROM puzzle_party_messages
      WHERE puzzle_id = p.id AND is_deleted = false
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    WHERE p.is_recruiting_party = true
      AND p.status NOT IN ('cancelled', 'expired')
      AND is_party_participant(p.id, auth.uid())
  ) t;
$$;
GRANT EXECUTE ON FUNCTION get_party_chats() TO authenticated;
