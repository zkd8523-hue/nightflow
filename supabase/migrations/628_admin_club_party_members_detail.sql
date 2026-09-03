-- ============================================================================
-- Migration 628: admin_get_club_party_members()에 파티 날짜/예산/인원 추가
-- 날짜: 2026-09-03
-- 배경: admin 파티 통계 클럽 행을 펼치면 "MM/DD HH:mm 발행 · status"만 보여서
--   어느 날짜, 어느 가격대 파티에 참여한 건지 알 수 없었다.
--   puzzles에 이미 있는 event_date / budget_per_person / total_budget /
--   target_count / current_count를 그대로 실어 보낸다. (556 본문 유지 + 컬럼 추가)
-- ============================================================================

-- RETURNS TABLE 컬럼이 바뀌면 CREATE OR REPLACE가 42P13으로 거부되므로 먼저 DROP.
-- (cron/트리거에서 호출하지 않고 admin 화면 클라이언트에서만 rpc로 부르는 함수라
--  잠깐 사라져도 다른 DB 객체가 깨지지 않음)
DROP FUNCTION IF EXISTS admin_get_club_party_members(UUID);

CREATE FUNCTION admin_get_club_party_members(p_club_id UUID)
RETURNS TABLE (
  puzzle_id         UUID,
  puzzle_status     TEXT,
  puzzle_created_at TIMESTAMPTZ,
  event_date        DATE,
  budget_per_person INTEGER,
  total_budget      INTEGER,
  target_count      INTEGER,
  current_count     INTEGER,
  user_id           UUID,
  display_name      TEXT,
  member_status     TEXT,
  reason            TEXT,
  event_at          TIMESTAMPTZ,
  is_leader         BOOLEAN
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
    WHERE p.club_id = p_club_id AND p.is_recruiting_party = true
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
    x.user_id, x.display_name, x.member_status, x.reason, x.event_at,
    (x.user_id = tp.leader_id) AS is_leader
  FROM target_puzzles tp
  JOIN (
    SELECT * FROM current_members
    UNION ALL
    SELECT * FROM past_events
  ) x ON x.puzzle_id = tp.id
  ORDER BY tp.event_date DESC NULLS LAST, tp.created_at DESC, x.event_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_get_club_party_members(UUID) TO authenticated;

COMMENT ON FUNCTION admin_get_club_party_members(UUID) IS
  'Admin 전용: 클럽별 파티 참여자 상세(파티 날짜/예산/인원 + 닉네임 + 참여중/나감/추방됨). 파티 통계 클럽 행 펼치기용.';
