-- ============================================================================
-- Migration 554: Admin 파티 통계 뷰에서 테스트 클럽/유저 제외
-- 날짜: 2026-08-25
-- 배경: Migration 550의 파티 통계 뷰 4종이 "운영자 테스트 클럽"(clubs.is_test)
--   데이터를 그대로 포함해 집계를 왜곡함(예: 발행 908건 중 814건이 테스트 클럽).
--   Migration 301(clubs.is_test), 204(users.is_test), 549(쿠폰 통계)와 동일한
--   기준으로 파티도 테스트 클럽/방장을 제외한다.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- View 1: admin_party_overview
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_party_overview
WITH (security_invoker = true) AS
WITH party AS (
  SELECT p.*,
         (SELECT COUNT(*) FROM puzzle_members m
           WHERE m.puzzle_id = p.id AND m.user_id <> p.leader_id) AS joiners
  FROM puzzles p
  LEFT JOIN clubs c ON c.id = p.club_id
  LEFT JOIN users u ON u.id = p.leader_id
  WHERE p.is_recruiting_party = true
    AND COALESCE(c.is_test, false) = false
    AND COALESCE(u.is_test, false) = false
)
SELECT
  COUNT(*)                                                        AS total_parties,
  COUNT(*) FILTER (WHERE host_is_md)                              AS md_hosted,
  COUNT(*) FILTER (WHERE NOT host_is_md)                          AS user_hosted,
  COUNT(*) FILTER (WHERE source_template_id IS NOT NULL)          AS auto_published,
  COUNT(*) FILTER (WHERE status = 'open')                         AS open_count,
  COUNT(*) FILTER (WHERE status = 'selecting')                    AS selecting_count,
  COUNT(*) FILTER (WHERE status IN ('matched','accepted'))        AS matched_count,
  COUNT(*) FILTER (WHERE status = 'cancelled')                    AS cancelled_count,
  COUNT(*) FILTER (WHERE status = 'expired')                      AS expired_count,
  COUNT(*) FILTER (WHERE joiners > 0)                             AS parties_with_joiner,
  COUNT(*) FILTER (WHERE joiners = 0)                             AS parties_empty,
  ROUND(100.0 * COUNT(*) FILTER (WHERE joiners > 0)
        / NULLIF(COUNT(*), 0), 1)                                 AS join_rate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('matched','accepted'))
        / NULLIF(COUNT(*), 0), 1)                                 AS match_rate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('cancelled','expired'))
        / NULLIF(COUNT(*), 0), 1)                                 AS churn_rate,
  COUNT(DISTINCT club_id) FILTER (WHERE club_id IS NOT NULL)      AS clubs_covered,
  COUNT(DISTINCT leader_id)                                       AS distinct_hosts
FROM party;

COMMENT ON VIEW admin_party_overview IS
  'Admin 파티 전체 합계 1행. 테스트 클럽/유저 제외. 참여 판정은 puzzle_members 실측.';

-- ─────────────────────────────────────────────────────────────
-- View 2: admin_party_weekly
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_party_weekly
WITH (security_invoker = true) AS
WITH party AS (
  SELECT p.*,
         (SELECT COUNT(*) FROM puzzle_members m
           WHERE m.puzzle_id = p.id AND m.user_id <> p.leader_id) AS joiners,
         (date_trunc('week', p.created_at AT TIME ZONE 'Asia/Seoul'))::date AS week_start
  FROM puzzles p
  LEFT JOIN clubs c ON c.id = p.club_id
  LEFT JOIN users u ON u.id = p.leader_id
  WHERE p.is_recruiting_party = true
    AND COALESCE(c.is_test, false) = false
    AND COALESCE(u.is_test, false) = false
)
SELECT
  week_start,
  COUNT(*)                                                    AS published,
  COUNT(*) FILTER (WHERE source_template_id IS NOT NULL)      AS auto_published,
  COUNT(*) FILTER (WHERE joiners > 0)                         AS with_joiner,
  SUM(joiners)                                                AS total_joiners,
  COUNT(*) FILTER (WHERE status IN ('matched','accepted'))    AS matched,
  COUNT(*) FILTER (WHERE status IN ('open','selecting'))      AS still_live,
  COUNT(*) FILTER (WHERE status IN ('cancelled','expired'))   AS churned,
  ROUND(100.0 * COUNT(*) FILTER (WHERE joiners > 0)
        / NULLIF(COUNT(*), 0), 1)                             AS join_rate,
  COUNT(DISTINCT club_id) FILTER (WHERE club_id IS NOT NULL)  AS clubs
FROM party
GROUP BY week_start
ORDER BY week_start DESC;

COMMENT ON VIEW admin_party_weekly IS
  'Admin 파티 주차별(KST) 발행/참여/성사/소멸 추세. 테스트 클럽/유저 제외.';

-- ─────────────────────────────────────────────────────────────
-- View 3: admin_party_by_club
-- ─────────────────────────────────────────────────────────────
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
  'Admin 클럽별 파티 발행 대비 참여. 테스트 클럽/유저 제외. join_rate 0%가 자동발행 낭비 목록.';

-- ─────────────────────────────────────────────────────────────
-- View 4: admin_party_offer_funnel
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_party_offer_funnel
WITH (security_invoker = true) AS
SELECT
  (date_trunc('week', o.created_at AT TIME ZONE 'Asia/Seoul'))::date AS week_start,
  COUNT(*)                                                AS offers,
  COUNT(*) FILTER (WHERE o.status = 'pending')            AS pending,
  COUNT(*) FILTER (WHERE o.status = 'accepted')           AS accepted,
  COUNT(*) FILTER (WHERE o.status = 'rejected')           AS rejected,
  COUNT(*) FILTER (WHERE o.status = 'withdrawn')          AS withdrawn,
  COUNT(*) FILTER (WHERE o.status = 'expired')            AS expired,
  ROUND(100.0 * COUNT(*) FILTER (WHERE o.status = 'accepted')
        / NULLIF(COUNT(*), 0), 1)                         AS accept_rate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE o.status = 'expired')
        / NULLIF(COUNT(*), 0), 1)                         AS expire_rate,
  COUNT(DISTINCT o.puzzle_id)                             AS parties_with_offer,
  COUNT(DISTINCT o.md_id)                                 AS mds_offering
FROM puzzle_offers o
JOIN puzzles p ON p.id = o.puzzle_id AND p.is_recruiting_party = true
LEFT JOIN clubs c ON c.id = p.club_id
LEFT JOIN users u ON u.id = p.leader_id
WHERE COALESCE(c.is_test, false) = false
  AND COALESCE(u.is_test, false) = false
GROUP BY week_start
ORDER BY week_start DESC;

COMMENT ON VIEW admin_party_offer_funnel IS
  'Admin 파티 오퍼 주차별 응답 퍼널(수락/거절/만료). 테스트 클럽/유저 제외.';
