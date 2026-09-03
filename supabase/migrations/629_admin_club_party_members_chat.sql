-- ============================================================================
-- Migration 629: admin_get_club_party_members() — 빈 파티 제외 + 채팅 지표 추가
-- 날짜: 2026-09-03
-- 배경: 628로 날짜/예산이 보이게 됐지만, 방장 혼자인 빈 파티(0/6명)가 목록을
--   가득 채워 실제로 사람이 붙은 파티를 찾을 수 없었다.
--   1) 방장 외 참여 이력(현재 참여중 or 나감/추방됨)이 있는 파티만 반환
--      — "방장 제외 실참여자" 기준은 550 통계 뷰의 joiners 정의와 동일
--   2) 파티별 실제 대화량(msg_count) + 마지막 발화자/시각 추가
--      — is_system(합류/나감 알림) 및 is_deleted 메시지는 제외
-- ============================================================================

-- RETURNS TABLE 컬럼이 바뀌므로 CREATE OR REPLACE 불가(42P13) → 먼저 DROP.
DROP FUNCTION IF EXISTS admin_get_club_party_members(UUID);

CREATE FUNCTION admin_get_club_party_members(p_club_id UUID)
RETURNS TABLE (
  puzzle_id           UUID,
  puzzle_status       TEXT,
  puzzle_created_at   TIMESTAMPTZ,
  event_date          DATE,
  budget_per_person   INTEGER,
  total_budget        INTEGER,
  target_count        INTEGER,
  current_count       INTEGER,
  msg_count           BIGINT,
  last_msg_at         TIMESTAMPTZ,
  last_msg_sender     TEXT,
  user_id             UUID,
  display_name        TEXT,
  member_status       TEXT,
  reason              TEXT,
  event_at            TIMESTAMPTZ,
  is_leader           BOOLEAN
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '관리자만 조회할 수 있습니다';
  END IF;

  RETURN QUERY
  WITH target_puzzles AS (
    SELECT p.id, p.status, p.created_at, p.leader_id,
           p.event_date, p.budget_per_person, p.total_budget,
           p.target_count, p.current_count
    FROM puzzles p
    WHERE p.club_id = p_club_id
      AND p.is_recruiting_party = true
      -- 방장 혼자인 빈 파티 제외: 현재 참여자 또는 과거 이탈자가 1명이라도 있어야 함
      AND (
        EXISTS (
          SELECT 1 FROM puzzle_members m
          WHERE m.puzzle_id = p.id AND m.user_id <> p.leader_id
        )
        OR EXISTS (
          SELECT 1 FROM puzzle_membership_events e
          WHERE e.puzzle_id = p.id
            AND e.user_id <> p.leader_id
            AND e.event_type IN ('left', 'kicked')
        )
      )
  ),
  -- 실제 대화만 집계 (시스템 알림/삭제 메시지 제외)
  chat AS (
    SELECT
      msg.puzzle_id,
      COUNT(*) AS msg_count,
      MAX(msg.created_at) AS last_msg_at,
      (ARRAY_AGG(
        COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '회원')
        ORDER BY msg.created_at DESC
      ))[1] AS last_msg_sender
    FROM puzzle_party_messages msg
    JOIN target_puzzles tp ON tp.id = msg.puzzle_id
    LEFT JOIN users u ON u.id = msg.sender_id
    WHERE msg.is_system = false
      AND msg.is_deleted = false
    GROUP BY msg.puzzle_id
  ),
  current_members AS (
    SELECT
      m.puzzle_id, m.user_id,
      COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '회원') AS display_name,
      '참여중'::TEXT AS member_status,
      NULL::TEXT AS reason,
      m.joined_at AS event_at
    FROM puzzle_members m
    JOIN target_puzzles tp ON tp.id = m.puzzle_id
    JOIN users u ON u.id = m.user_id
  ),
  past_events AS (
    SELECT
      e.puzzle_id, e.user_id,
      COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '회원') AS display_name,
      CASE e.event_type WHEN 'kicked' THEN '추방됨' ELSE '나감' END AS member_status,
      e.reason,
      e.created_at AS event_at
    FROM puzzle_membership_events e
    JOIN target_puzzles tp ON tp.id = e.puzzle_id
    JOIN users u ON u.id = e.user_id
    WHERE e.event_type IN ('left', 'kicked')
      -- 나간 뒤 재합류해서 현재 다시 참여중이면 과거 이탈 기록은 숨김
      AND NOT EXISTS (
        SELECT 1 FROM puzzle_members m2
        WHERE m2.puzzle_id = e.puzzle_id AND m2.user_id = e.user_id
      )
  )
  SELECT
    tp.id, tp.status, tp.created_at,
    tp.event_date, tp.budget_per_person, tp.total_budget,
    tp.target_count, tp.current_count,
    COALESCE(c.msg_count, 0), c.last_msg_at, c.last_msg_sender,
    x.user_id, x.display_name, x.member_status, x.reason, x.event_at,
    (x.user_id = tp.leader_id) AS is_leader
  FROM target_puzzles tp
  JOIN (
    SELECT * FROM current_members
    UNION ALL
    SELECT * FROM past_events
  ) x ON x.puzzle_id = tp.id
  LEFT JOIN chat c ON c.puzzle_id = tp.id
  ORDER BY tp.event_date DESC NULLS LAST, tp.created_at DESC, x.event_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_get_club_party_members(UUID) TO authenticated;

COMMENT ON FUNCTION admin_get_club_party_members(UUID) IS
  'Admin 전용: 클럽별 파티 참여자 상세(날짜/예산/인원/채팅수 + 닉네임 + 참여중/나감/추방됨). 방장 혼자인 빈 파티는 제외. 파티 통계 클럽 행 펼치기용.';
