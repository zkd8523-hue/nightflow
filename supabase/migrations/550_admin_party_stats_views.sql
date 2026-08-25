-- ============================================================================
-- Migration 550: Admin 파티(조각) 통계 뷰 4종
-- 날짜: 2026-08-25
-- 목표: "파티가 실제로 쓰이나 / 어디서 이탈하나"를 admin이 SQL 없이 조회
--
-- 배경(2026-08-25 실측): 파티 902건 중 방장 외 참여자가 붙은 건 11건(1.2%).
--   status는 cancelled 814 / expired 34 / open 35, matched·accepted 0.
--   8/04 하루에 647건이 템플릿 자동발행되며 참여율이 0.5%로 붕괴.
--   → 문제는 "발행"이 아니라 "첫 참여자가 안 붙는 것". 뷰는 이 지점을 겨냥한다.
--
-- 뷰 4개:
--   1. admin_party_overview     — 전체 합계 1행 (KPI 카드)
--   2. admin_party_weekly       — 주차별 발행/참여/성사/소멸 추세
--   3. admin_party_by_club      — 클럽별 발행 대비 참여 (소진율 0% 랭킹)
--   4. admin_party_offer_funnel — MD 오퍼 응답 퍼널
--
-- 설계 노트:
--   - "파티" = puzzles WHERE is_recruiting_party = true (깃발과 구분)
--   - 참여 판정은 puzzle_members 실측 기준. puzzles.current_count는 guest_count를
--     포함하고 탈퇴 시 어긋날 수 있어(실측 19 vs 11건 불일치) 참고값으로만 병기.
--   - 노출/클릭 단계는 아직 미계측(Phase 2) → 뷰에 넣지 않는다. 0으로 위장 금지.
--   - security_invoker=true → RLS 상속
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- View 1: admin_party_overview — 전체 합계 1행
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_party_overview
WITH (security_invoker = true) AS
WITH party AS (
  SELECT p.*,
         -- 방장 제외 실참여자 수 (실측 기준)
         (SELECT COUNT(*) FROM puzzle_members m
           WHERE m.puzzle_id = p.id AND m.user_id <> p.leader_id) AS joiners
  FROM puzzles p
  WHERE p.is_recruiting_party = true
)
SELECT
  COUNT(*)                                                        AS total_parties,
  COUNT(*) FILTER (WHERE host_is_md)                              AS md_hosted,
  COUNT(*) FILTER (WHERE NOT host_is_md)                          AS user_hosted,
  COUNT(*) FILTER (WHERE source_template_id IS NOT NULL)          AS auto_published,
  -- 상태
  COUNT(*) FILTER (WHERE status = 'open')                         AS open_count,
  -- selecting = 오퍼 마감 후 방장이 고르는 중 (170_puzzle_two_phase_deadline)
  COUNT(*) FILTER (WHERE status = 'selecting')                    AS selecting_count,
  COUNT(*) FILTER (WHERE status IN ('matched','accepted'))        AS matched_count,
  COUNT(*) FILTER (WHERE status = 'cancelled')                    AS cancelled_count,
  COUNT(*) FILTER (WHERE status = 'expired')                      AS expired_count,
  -- 핵심 지표: 첫 참여자가 붙었는가
  COUNT(*) FILTER (WHERE joiners > 0)                             AS parties_with_joiner,
  COUNT(*) FILTER (WHERE joiners = 0)                             AS parties_empty,
  ROUND(100.0 * COUNT(*) FILTER (WHERE joiners > 0)
        / NULLIF(COUNT(*), 0), 1)                                 AS join_rate,
  -- 성사율 (참여 이후 단계)
  ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('matched','accepted'))
        / NULLIF(COUNT(*), 0), 1)                                 AS match_rate,
  -- 소멸률 = 취소+만료. 현재 94% 수준이면 명백한 이상 신호
  ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('cancelled','expired'))
        / NULLIF(COUNT(*), 0), 1)                                 AS churn_rate,
  COUNT(DISTINCT club_id) FILTER (WHERE club_id IS NOT NULL)      AS clubs_covered,
  COUNT(DISTINCT leader_id)                                       AS distinct_hosts
FROM party;

COMMENT ON VIEW admin_party_overview IS
  'Admin 파티 전체 합계 1행. 참여 판정은 puzzle_members 실측.';

-- ─────────────────────────────────────────────────────────────
-- View 2: admin_party_weekly — 주차별 추세 (KST 월요일 시작)
-- 자동 대량발행이 참여율을 어떻게 무너뜨렸는지 시계열로 드러낸다.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_party_weekly
WITH (security_invoker = true) AS
WITH party AS (
  SELECT p.*,
         (SELECT COUNT(*) FROM puzzle_members m
           WHERE m.puzzle_id = p.id AND m.user_id <> p.leader_id) AS joiners,
         (date_trunc('week', p.created_at AT TIME ZONE 'Asia/Seoul'))::date AS week_start
  FROM puzzles p
  WHERE p.is_recruiting_party = true
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
  'Admin 파티 주차별(KST) 발행/참여/성사/소멸 추세.';

-- ─────────────────────────────────────────────────────────────
-- View 3: admin_party_by_club — 클럽별 발행 대비 참여
-- join_rate=0인 클럽 = 자동발행이 낭비되는 곳. 발행 중단 판단 근거.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_party_by_club
WITH (security_invoker = true) AS
WITH party AS (
  SELECT p.*,
         (SELECT COUNT(*) FROM puzzle_members m
           WHERE m.puzzle_id = p.id AND m.user_id <> p.leader_id) AS joiners
  FROM puzzles p
  WHERE p.is_recruiting_party = true
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
-- 발행 많고 참여 없는 순 = 낭비 큰 순
ORDER BY COUNT(*) FILTER (WHERE pa.joiners > 0) ASC, COUNT(*) DESC;

COMMENT ON VIEW admin_party_by_club IS
  'Admin 클럽별 파티 발행 대비 참여. join_rate 0%가 자동발행 낭비 목록.';

-- ─────────────────────────────────────────────────────────────
-- View 4: admin_party_offer_funnel — MD 오퍼 응답 퍼널
-- 파티에 달린 오퍼가 수락까지 가는지. pending 적체/무응답 만료를 본다.
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
  -- 무응답 만료 비율 = 유저가 오퍼를 안 본다는 신호
  ROUND(100.0 * COUNT(*) FILTER (WHERE o.status = 'expired')
        / NULLIF(COUNT(*), 0), 1)                         AS expire_rate,
  COUNT(DISTINCT o.puzzle_id)                             AS parties_with_offer,
  COUNT(DISTINCT o.md_id)                                 AS mds_offering
FROM puzzle_offers o
JOIN puzzles p ON p.id = o.puzzle_id AND p.is_recruiting_party = true
GROUP BY week_start
ORDER BY week_start DESC;

COMMENT ON VIEW admin_party_offer_funnel IS
  'Admin 파티 오퍼 주차별 응답 퍼널(수락/거절/만료).';
