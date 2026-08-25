-- ============================================================================
-- Migration 555: admin_party_by_club에서 "클럽 미지정"(club_id NULL) 행 제외
-- 날짜: 2026-08-25
-- 배경: 클럽별 통계 표는 특정 클럽의 자동발행 낭비 여부를 보기 위한 것인데,
--   club_id가 없는 파티(유저가 직접 만든 깃발/파티)는 "클럽 미지정"으로
--   뭉뚱그려 나와 의미 있는 랭킹을 방해한다. 이 뷰에서만 제외하고,
--   전체 합계(admin_party_overview)에는 영향 없음.
-- ============================================================================

CREATE OR REPLACE VIEW admin_party_by_club
WITH (security_invoker = true) AS
WITH party AS (
  SELECT p.*,
         (SELECT COUNT(*) FROM puzzle_members m
           WHERE m.puzzle_id = p.id AND m.user_id <> p.leader_id) AS joiners
  FROM puzzles p
  LEFT JOIN clubs c ON c.id = p.club_id
  LEFT JOIN users u ON u.id = p.leader_id
  WHERE p.is_recruiting_party = true
    AND p.club_id IS NOT NULL
    AND COALESCE(c.is_test, false) = false
    AND COALESCE(u.is_test, false) = false
)
SELECT
  pa.club_id,
  c.name                                                      AS club_name,
  pa.area,
  COUNT(*)                                                    AS published,
  COUNT(*) FILTER (WHERE pa.source_template_id IS NOT NULL)   AS auto_published,
  COUNT(*) FILTER (WHERE pa.joiners > 0)                      AS with_joiner,
  SUM(pa.joiners)                                             AS total_joiners,
  COUNT(*) FILTER (WHERE pa.status IN ('matched','accepted')) AS matched,
  ROUND(100.0 * COUNT(*) FILTER (WHERE pa.joiners > 0)
        / NULLIF(COUNT(*), 0), 1)                             AS join_rate,
  ROUND(AVG(pa.budget_per_person))                            AS avg_budget,
  MIN(pa.created_at)                                          AS first_published_at,
  MAX(pa.created_at)                                          AS last_published_at
FROM party pa
LEFT JOIN clubs c ON c.id = pa.club_id
GROUP BY pa.club_id, c.name, pa.area
ORDER BY COUNT(*) FILTER (WHERE pa.joiners > 0) ASC, COUNT(*) DESC;

COMMENT ON VIEW admin_party_by_club IS
  'Admin 클럽별 파티 발행 대비 참여. 테스트 클럽/유저 및 club_id NULL(미지정) 제외. join_rate 0%가 자동발행 낭비 목록.';
