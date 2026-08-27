-- ============================================================================
-- Migration 599: get_party_chats — 채팅방 제목용 클럽명(club_name) 추가
-- 날짜: 2026-08-28
-- 배경:
--   "나의 채팅 → 파티" 목록의 방 제목이 puzzles.notes를 그대로 쓰고 있었다.
--   notes는 방장이 자유롭게 적는 메모라 "dd" 같은 값이 그대로 제목이 되어
--   어느 클럽·어느 파티인지 전혀 알 수 없었다.
--
--   클럽 대표 이미지(club_thumbnail)는 이미 내려주고 있으면서 정작 이름은
--   없어서 프론트가 폴백을 만들 수 없었다. 같은 JOIN(clubs c)에서 name만
--   추가로 내려준다 — 쿼리 비용 증가 없음.
--
--   592 본문 그대로 + club_name 한 줄 삽입.
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
      c.name              AS club_name,
      (p.leader_id = auth.uid()) AS is_leader,
      p.status            AS puzzle_status,
      COALESCE(lm.content, '단체채팅이 열렸어요') AS last_content,
      COALESCE(lm.created_at, p.created_at) AS last_at,
      lm.sender_id        AS last_sender_id,
      ur.cnt              AS unread_count,
      (ur.cnt > 0)        AS unread
    FROM puzzles p
    LEFT JOIN clubs c ON c.id = p.club_id
    -- 파트너(초대된 MD)면 자기 방(room_md_id=본인)만, 방장·멤버면 모든 방 기준
    LEFT JOIN LATERAL (
      SELECT content, created_at, sender_id
      FROM puzzle_party_messages
      WHERE puzzle_id = p.id AND is_deleted = false
        AND (
          NOT EXISTS (SELECT 1 FROM puzzle_party_md pm0 WHERE pm0.puzzle_id = p.id AND pm0.md_id = auth.uid())
          OR room_md_id IS NOT DISTINCT FROM auth.uid()
        )
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INT AS cnt
      FROM puzzle_party_messages m2
      WHERE m2.puzzle_id = p.id
        AND m2.is_deleted = false
        AND m2.is_system = false
        AND m2.sender_id IS DISTINCT FROM auth.uid()
        AND (
          NOT EXISTS (SELECT 1 FROM puzzle_party_md pm1 WHERE pm1.puzzle_id = p.id AND pm1.md_id = auth.uid())
          OR m2.room_md_id IS NOT DISTINCT FROM auth.uid()
        )
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
      -- 대화가 시작됐거나(522), 방장 외 합류 멤버가 있거나(547),
      -- ⭐ 본인이 초대된 파트너면(592) 활동 여부와 무관하게 노출한다.
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
        OR EXISTS (
          SELECT 1 FROM puzzle_party_md pm2
          WHERE pm2.puzzle_id = p.id
            AND pm2.md_id = auth.uid()
        )
      )
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_party_chats() TO authenticated;

COMMENT ON FUNCTION get_party_chats() IS
  '조각 단체방 목록 + 안읽음 개수. 대화가 있거나 합류 멤버가 있거나 본인이 초대된 파트너면 노출(592). 제목용 club_name 포함(599).';
