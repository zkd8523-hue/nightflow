-- ============================================================================
-- Migration 549: Admin 쿠폰 통계 뷰 3종
-- 날짜: 2026-08-25
-- 목표: "쿠폰이 실제로 쓰이나 / 어디서 이탈하나"를 admin이 SQL 없이 조회
--
-- 뷰 3개:
--   1. admin_coupon_overview — 전체 합계 1행 (KPI 카드용)
--   2. admin_coupon_funnel   — 발행물별 재고→받음→사용 퍼널 + 소진 속도
--   3. admin_coupon_daily    — 일자별 받음/사용 시계열
--
-- 원칙:
--   - security_invoker=true → user/claim RLS 상속. admin만 실질 조회 가능
--   - 테스트 유저(users.is_test) 제외. get_md_coupon_stats(539:766)와 동일 기준
--   - VIEW(materialized 아님) — 현재 발행 9건 규모라 실시간으로 충분
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- View 1: admin_coupon_overview — 전체 합계 1행
-- 발행/받음/사용 총량과 전환율. "이 기능 쓰이나?"에 한 줄로 답한다.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_coupon_overview
WITH (security_invoker = true) AS
WITH real_claims AS (
  SELECT c.*
  FROM coupon_claims c
  JOIN users u ON u.id = c.user_id
  WHERE COALESCE(u.is_test, false) = false
)
SELECT
  (SELECT COUNT(*) FROM coupon_issues)                                    AS total_issues,
  (SELECT COUNT(*) FROM coupon_issues WHERE status = 'active')            AS active_issues,
  (SELECT COUNT(*) FROM coupon_issues WHERE status = 'cancelled')         AS cancelled_issues,
  (SELECT COUNT(*) FROM coupon_issues WHERE status = 'sold_out')          AS soldout_issues,
  (SELECT COUNT(*) FROM coupon_issues WHERE status = 'expired')           AS expired_issues,
  -- 발행 클럽/MD 수 = 공급측 참여 폭
  (SELECT COUNT(DISTINCT club_id) FROM coupon_issues)                     AS clubs_issuing,
  (SELECT COUNT(DISTINCT md_id) FROM coupon_issues)                       AS mds_issuing,
  -- 수요측
  (SELECT COUNT(*) FROM real_claims)                                      AS total_claims,
  (SELECT COUNT(DISTINCT user_id) FROM real_claims)                       AS unique_claimers,
  (SELECT COUNT(*) FROM real_claims WHERE redeemed_at IS NOT NULL)        AS total_redeems,
  (SELECT COUNT(*) FROM real_claims WHERE status = 'revoked')             AS revoked_claims,
  (SELECT COUNT(*) FROM real_claims WHERE status = 'expired')             AS expired_claims,
  -- 전환율: 받은 것 중 실제 현장 사용 비율. 쿠폰의 핵심 지표.
  ROUND(
    100.0 * (SELECT COUNT(*) FROM real_claims WHERE redeemed_at IS NOT NULL)
    / NULLIF((SELECT COUNT(*) FROM real_claims), 0), 1
  )                                                                       AS redeem_rate,
  -- 아무도 안 받은 발행물 = 노출/매력도 문제 신호
  (SELECT COUNT(*) FROM coupon_issues WHERE claimed_count = 0)            AS zero_claim_issues;

COMMENT ON VIEW admin_coupon_overview IS
  'Admin 쿠폰 전체 합계 1행. 테스트 유저 제외.';

-- ─────────────────────────────────────────────────────────────
-- View 2: admin_coupon_funnel — 발행물별 퍼널
-- 재고 → 받음 → 사용. 어느 단계에서 끊기는지 발행물 단위로 본다.
-- claimed_count/redeemed_count 컬럼 대신 claims를 직접 집계한다:
--   컬럼은 테스트 유저를 포함하고, revoked 롤백 이력이 반영 안 될 수 있음.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_coupon_funnel
WITH (security_invoker = true) AS
SELECT
  i.id                              AS issue_id,
  i.title,
  i.benefit_type,
  i.status,
  i.club_id,
  cl.name                           AS club_name,
  cl.area                           AS club_area,
  i.md_id,
  u.name                            AS md_name,
  i.total_count,
  i.created_at,
  i.starts_at,
  i.redeem_ends_at,
  -- 실측 집계 (테스트 유저 제외)
  COUNT(c.id)                                                   AS claims,
  COUNT(c.id) FILTER (WHERE c.redeemed_at IS NOT NULL)          AS redeems,
  COUNT(c.id) FILTER (WHERE c.status = 'revoked')               AS revoked,
  COUNT(c.id) FILTER (WHERE c.status = 'expired')               AS expired_unused,
  -- 재고 소진율: NULL(무제한)이면 NULL
  CASE WHEN i.total_count IS NULL THEN NULL
       ELSE ROUND(100.0 * COUNT(c.id) / NULLIF(i.total_count, 0), 1)
  END                                                           AS claim_rate,
  -- 받은 사람 중 실제 사용 비율
  ROUND(100.0 * COUNT(c.id) FILTER (WHERE c.redeemed_at IS NOT NULL)
        / NULLIF(COUNT(c.id), 0), 1)                            AS redeem_rate,
  MIN(c.claimed_at)                                             AS first_claim_at,
  MAX(c.claimed_at)                                             AS last_claim_at,
  -- 소진 속도: 첫 받음 → 마지막 받음까지 걸린 시간(시). 인기도 대리 지표.
  ROUND(EXTRACT(EPOCH FROM (MAX(c.claimed_at) - MIN(c.claimed_at))) / 3600.0, 1)
                                                                AS claim_span_hours,
  -- 패스코드 오입력 누적 = 현장 사용 마찰 신호
  COALESCE(SUM(c.redeem_fail_count), 0)                         AS redeem_fail_total
FROM coupon_issues i
LEFT JOIN clubs cl ON cl.id = i.club_id
LEFT JOIN users u  ON u.id  = i.md_id
LEFT JOIN coupon_claims c
       ON c.issue_id = i.id
      AND COALESCE((SELECT is_test FROM users WHERE id = c.user_id), false) = false
GROUP BY i.id, i.title, i.benefit_type, i.status, i.club_id, cl.name, cl.area,
         i.md_id, u.name, i.total_count, i.created_at, i.starts_at, i.redeem_ends_at
ORDER BY i.created_at DESC;

COMMENT ON VIEW admin_coupon_funnel IS
  'Admin 발행물별 쿠폰 퍼널(재고→받음→사용). 카운터 컬럼이 아닌 claims 직접 집계.';

-- ─────────────────────────────────────────────────────────────
-- View 3: admin_coupon_daily — 일자별 시계열 (KST 기준)
-- 발행/받음/사용 추세. "쓰이나"의 추세 답변.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_coupon_daily
WITH (security_invoker = true) AS
WITH issued AS (
  SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS d, COUNT(*) AS n
  FROM coupon_issues GROUP BY 1
),
claimed AS (
  SELECT (c.claimed_at AT TIME ZONE 'Asia/Seoul')::date AS d,
         COUNT(*) AS n, COUNT(DISTINCT c.user_id) AS uniq
  FROM coupon_claims c
  JOIN users u ON u.id = c.user_id
  WHERE COALESCE(u.is_test, false) = false
  GROUP BY 1
),
redeemed AS (
  SELECT (c.redeemed_at AT TIME ZONE 'Asia/Seoul')::date AS d, COUNT(*) AS n
  FROM coupon_claims c
  JOIN users u ON u.id = c.user_id
  WHERE c.redeemed_at IS NOT NULL AND COALESCE(u.is_test, false) = false
  GROUP BY 1
)
SELECT
  d.day                                AS day,
  COALESCE(i.n, 0)                     AS issues_created,
  COALESCE(c.n, 0)                     AS claims,
  COALESCE(c.uniq, 0)                  AS unique_claimers,
  COALESCE(r.n, 0)                     AS redeems
FROM (
  SELECT DISTINCT day FROM (
    SELECT d AS day FROM issued
    UNION SELECT d FROM claimed
    UNION SELECT d FROM redeemed
  ) x WHERE day IS NOT NULL
) d
LEFT JOIN issued   i ON i.d = d.day
LEFT JOIN claimed  c ON c.d = d.day
LEFT JOIN redeemed r ON r.d = d.day
ORDER BY d.day DESC;

COMMENT ON VIEW admin_coupon_daily IS
  'Admin 쿠폰 일자별(KST) 발행/받음/사용 시계열.';
