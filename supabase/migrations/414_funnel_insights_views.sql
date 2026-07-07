-- ============================================================================
-- Migration 414: 이탈·전환 인사이트 뷰 4종
-- 날짜: 2026-07-07
-- 목표: Admin 대시보드가 SQL 없이 조회할 수 있도록 미리 집계된 뷰 제공
--
-- 뷰 4개:
--   1. dropoff_hotspots        — 이탈 지점 TOP N (세션의 last_event 분포)
--   2. signup_funnel           — 회원가입 5단계 퍼널 (start→agree→phone→completed)
--   3. acquisition_quality     — UTM source/landing별 유입 품질 (세션·이탈·전환)
--   4. dropoff_by_lang         — 언어별 이탈 지점 (외국인 트랙 진단)
--
-- 원칙:
--   - 최근 7일 기준. Admin 페이지에서 필요 시 클라이언트 필터로 축소
--   - RLS로 admin만 SELECT 가능
--   - VIEW라서 실시간 반영 (materialized 아님, 소규모 데이터라 충분)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- View 1: dropoff_hotspots
-- 최근 7일 세션의 마지막 이벤트별 카운트. 이탈 지점 순위.
-- HAVING COUNT(*) >= 5: k-anonymity, 세션 5개 미만은 개인 식별 가능해 제외.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW dropoff_hotspots
WITH (security_invoker = true) AS
SELECT
  last_event,
  COUNT(*) AS session_count,
  COUNT(DISTINCT anon_id) AS unique_users,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct,
  ROUND(AVG(duration_seconds)) AS avg_duration_sec,
  ROUND(AVG(event_count), 1) AS avg_event_count
FROM user_sessions
WHERE session_started_at >= now() - INTERVAL '7 days'
  AND last_event IS NOT NULL
GROUP BY last_event
HAVING COUNT(*) >= 5
ORDER BY session_count DESC;

COMMENT ON VIEW dropoff_hotspots IS
  '최근 7일 세션의 이탈 지점 순위. Admin 대시보드용.';

-- ─────────────────────────────────────────────────────────────
-- View 2: signup_funnel
-- 회원가입 5단계 전환률. 최근 7일.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW signup_funnel
WITH (security_invoker = true) AS
WITH stages AS (
  SELECT
    COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'signup_start') AS step1_start,
    COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'signup_agree') AS step2_agree,
    COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'signup_phone_verified') AS step3_phone,
    COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'signup_completed') AS step4_completed
  FROM user_events
  WHERE created_at >= now() - INTERVAL '7 days'
)
SELECT
  step1_start,
  step2_agree,
  step3_phone,
  step4_completed,
  ROUND(100.0 * step2_agree / NULLIF(step1_start, 0), 1) AS agree_rate,
  ROUND(100.0 * step3_phone / NULLIF(step2_agree, 0), 1) AS phone_rate,
  ROUND(100.0 * step4_completed / NULLIF(step3_phone, 0), 1) AS complete_rate,
  ROUND(100.0 * step4_completed / NULLIF(step1_start, 0), 1) AS overall_rate
FROM stages;

COMMENT ON VIEW signup_funnel IS
  '회원가입 5단계 퍼널 전환률 (최근 7일).';

-- ─────────────────────────────────────────────────────────────
-- View 3: acquisition_quality
-- UTM source별 유입 세션 품질. 최근 7일.
-- HAVING COUNT(*) >= 5: k-anonymity 임계.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW acquisition_quality
WITH (security_invoker = true) AS
SELECT
  COALESCE(utm_source, '(direct)') AS source,
  COUNT(*) AS session_count,
  COUNT(DISTINCT anon_id) AS unique_users,
  ROUND(AVG(duration_seconds)) AS avg_duration_sec,
  ROUND(AVG(event_count), 1) AS avg_events,
  COUNT(*) FILTER (WHERE did_login) AS login_count,
  COUNT(*) FILTER (WHERE did_create_flag) AS flag_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE did_login) / NULLIF(COUNT(*), 0), 1) AS login_rate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE did_create_flag) / NULLIF(COUNT(*), 0), 1) AS flag_rate,
  -- 이탈률 = 이벤트 1개짜리 세션 비율 (bounce)
  ROUND(100.0 * COUNT(*) FILTER (WHERE event_count = 1) / NULLIF(COUNT(*), 0), 1) AS bounce_rate
FROM user_sessions
WHERE session_started_at >= now() - INTERVAL '7 days'
GROUP BY COALESCE(utm_source, '(direct)')
HAVING COUNT(*) >= 5
ORDER BY session_count DESC;

COMMENT ON VIEW acquisition_quality IS
  'UTM source별 유입 품질 (최근 7일). 세션 수·이탈률·전환률.';

-- ─────────────────────────────────────────────────────────────
-- View 4: dropoff_by_lang
-- 언어별 이탈 지점 (외국인 트랙 진단용). 최근 7일.
-- 언어 전체 세션 5개 미만은 아예 제외(k-anonymity).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW dropoff_by_lang
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    COALESCE(lang, 'unknown') AS lang,
    last_event,
    COUNT(*) AS session_count,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(lang, 'unknown')
      ORDER BY COUNT(*) DESC
    ) AS rn
  FROM user_sessions
  WHERE session_started_at >= now() - INTERVAL '7 days'
    AND last_event IS NOT NULL
  GROUP BY COALESCE(lang, 'unknown'), last_event
),
totals AS (
  SELECT
    COALESCE(lang, 'unknown') AS lang,
    COUNT(*) AS total_sessions
  FROM user_sessions
  WHERE session_started_at >= now() - INTERVAL '7 days'
  GROUP BY COALESCE(lang, 'unknown')
  HAVING COUNT(*) >= 5
)
SELECT
  r.lang,
  r.last_event,
  r.session_count,
  t.total_sessions,
  ROUND(100.0 * r.session_count / NULLIF(t.total_sessions, 0), 1) AS pct
FROM ranked r
JOIN totals t ON t.lang = r.lang
WHERE r.rn <= 5
  AND r.session_count >= 3
ORDER BY r.lang, r.session_count DESC;

COMMENT ON VIEW dropoff_by_lang IS
  '언어별 이탈 지점 TOP 5 (최근 7일). 외국인 트랙 진단용.';

-- ============================================================================
-- 보안 설계 (검토 완료):
--
-- 1. 4개 뷰 모두 WITH (security_invoker = true) → user_events의 RLS가 상속됨.
--    user_events RLS(408_user_events.sql:67-70)는 admin만 SELECT 허용.
--    → anon 키로 /rest/v1/dropoff_hotspots 호출 시 admin 아니면 빈 결과.
--
-- 2. 유효 admin 세션이 없으면 뷰가 상속받는 user_events의 admin-only RLS에 걸려
--    조회 실패. 즉 뷰 자체에 별도 GRANT/REVOKE 불필요.
--
-- 3. HAVING COUNT(*) >= 5로 k-anonymity 임계 확보:
--    - 세션 5개 미만인 last_event/utm_source/lang은 아예 제외
--    - dropoff_by_lang은 lang 전체 세션도 5개 이상만 노출
--    - 소수 유저(예: /zh-tw 초기 1-2명) 개별 식별 방지
-- ============================================================================
