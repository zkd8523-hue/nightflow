-- ============================================================================
-- Migration 592: get_party_chats — 초대된 파트너의 파티가 목록에 안 뜨는 버그 수정
-- 날짜: 2026-08-27
-- 배경:
--   Migration 547의 "활동 없는 자동발행 파티는 숨긴다" 필터는
--   (1) 비시스템 메시지가 있거나 (2) 방장 외 합류 멤버가 있어야만 목록에 노출한다.
--   그런데 파트너 초대는 이 둘 중 어느 것도 만들지 않는다:
--     - 상담 시작/초대/종료 시스템 메시지는 is_system=true라서 (1)에서 제외된다
--     - 파트너는 puzzle_members가 아니라 puzzle_party_md에 들어가므로 (2)에도 안 걸린다
--   그 결과 "초대는 됐는데 아직 아무도 채팅을 안 친" 새 파티가 파트너의
--   "나의 채팅 → 파티" 목록에서 완전히 사라지는 버그가 생겼다.
--
--   또한 다중 파트너 도입으로 last_content/unread_count가 파티 전체 메시지
--   기준이라, 파트너가 자기 방이 아닌 다른 방(파티원방 등)의 미리보기를
--   보게 되는 문제도 같이 고친다 — 파트너면 자기 room_md_id만, 방장·멤버는
--   기존처럼 전체(모든 방) 기준으로 계산한다.
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
  '조각 단체방 목록 + 안읽음 개수. 대화가 있거나 합류 멤버가 있거나 본인이 초대된 파트너면 노출(Migration 592).';
