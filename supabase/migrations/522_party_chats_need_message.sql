-- ============================================================================
-- Migration 522: 조각 단체방은 "대화가 시작된 뒤"에만 채팅 목록에 뜬다
-- 날짜: 2026-08-05
-- 배경:
--   상시 조각 자동 발행(505/507)이 붙으면서 조각이 날짜별로 여러 건 생성되고,
--   발행할 때마다 방장(MD)을 puzzle_members에 넣는다. get_party_chats는
--   "내가 참여자인 모든 조각"을 보여주므로, MD 채팅 목록이 아무도 없는 빈 방으로
--   도배됐다 (템플릿 수 × 발행 날짜 수 = 하루에도 수십 개).
--
--   방 자체는 그대로 둔다(조각 상세에서 /party/{id}로 언제든 들어갈 수 있다).
--   목록에만 "실제 대화(시스템 메시지 제외)가 한 건이라도 있는 방"을 노출한다.
--
--   흐름: 유저가 조각에 참가 → 조각 상세/참가 완료 화면에서 단체방 진입 →
--         첫 메시지 → 그때 양쪽 채팅 목록에 나타난다.
--
--   ⚠️ 참가만 하고 아무도 말을 걸지 않으면 목록에 뜨지 않는다. 참가 사실은
--      알림과 "내 조각"의 인원 수로 확인한다.
--
--   484 본문 그대로 + WHERE 조건 한 줄 추가.
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
      -- 대화가 시작된 방만 목록에 (Migration 522) — 자동 발행 조각의 빈 방 도배 차단
      AND EXISTS (
        SELECT 1 FROM puzzle_party_messages m3
        WHERE m3.puzzle_id = p.id
          AND m3.is_deleted = false
          AND m3.is_system = false
      )
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_party_chats() TO authenticated;

COMMENT ON FUNCTION get_party_chats() IS
  '조각 단체방 목록 + 안읽음 개수. 실제 대화가 한 건이라도 있는 방만 노출(Migration 522).';
