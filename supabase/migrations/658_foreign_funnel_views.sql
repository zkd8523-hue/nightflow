-- ============================================================================
-- Migration 658: 외국인 전환 대시보드용 뷰 2개
--
-- 배경: /admin/insights에 나라별 예약 전환을 보는 화면이 없었다. 기존
-- dropoff_by_lang은 "마지막 이벤트"만 보여줘서 단계별 통과율·이탈 지점을
-- 알 수 없었다.
--
-- 원칙은 Migration 414의 기존 4개 뷰와 동일:
--   - security_invoker = true (RLS로 admin만 SELECT)
--   - VIEW (materialized 아님) — 소규모 데이터라 실시간으로 충분
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- View 1: foreign_funnel_by_lang
-- 언어 × 퍼널 단계별 고유 세션 수. A안(도넛)·B안(단계 막대) 공용.
--
-- ⚠️ 단계 간 비율로 계산하면 안 된다 — 폼 도달의 69%가 CTA를 안 거치므로
--    (실측 272세션 중 187건) 폼/CTA가 1을 넘는다. 랜딩 대비로만 본다.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW foreign_funnel_by_lang
WITH (security_invoker = true) AS
WITH sessions AS (
  SELECT
    lang,
    session_id,
    -- 랜딩: SEO 페이지 진입 또는 언어별 홈
    MAX(CASE WHEN event_name IN (
      'foreign_club_page_view','foreign_guide_page_view','foreign_info_page_view',
      'foreign_clubs_view','en_home_view','ja_home_view','zh_home_view','zh_tw_home_view'
    ) THEN 1 ELSE 0 END) AS landed,
    -- CTA: 예약 폼으로 가는 버튼·링크 클릭 (사이드바 포함)
    MAX(CASE WHEN event_name IN (
      'foreign_book_at_club_click','foreign_club_page_click','foreign_guide_page_click',
      'foreign_info_page_click','foreign_sidebar_cta_click','foreign_plant_flag_click'
    ) THEN 1 ELSE 0 END) AS cta_clicked,
    MAX(CASE WHEN event_name = 'foreign_request_form_view' THEN 1 ELSE 0 END) AS form_viewed,
    MAX(CASE WHEN event_name = 'foreign_trip_gate_qualified' THEN 1 ELSE 0 END) AS gate_passed,
    MAX(CASE WHEN event_name = 'foreign_request_submitted' THEN 1 ELSE 0 END) AS submitted
  FROM user_events
  WHERE created_at >= now() - INTERVAL '60 days'
    AND lang IS NOT NULL
    AND lang <> 'ko'
    AND session_id IS NOT NULL
  GROUP BY lang, session_id
)
SELECT
  lang,
  SUM(landed)::INT       AS landed,
  SUM(cta_clicked)::INT  AS cta_clicked,
  SUM(form_viewed)::INT  AS form_viewed,
  SUM(gate_passed)::INT  AS gate_passed,
  SUM(submitted)::INT    AS submitted,
  -- 전부 "랜딩 대비" 비율. 단계 간 비율이 아니다(위 주석 참조).
  ROUND(100.0 * SUM(cta_clicked) / NULLIF(SUM(landed), 0), 1) AS cta_rate,
  ROUND(100.0 * SUM(form_viewed) / NULLIF(SUM(landed), 0), 1) AS form_rate,
  ROUND(100.0 * SUM(gate_passed) / NULLIF(SUM(landed), 0), 1) AS gate_rate,
  ROUND(100.0 * SUM(submitted)  / NULLIF(SUM(landed), 0), 2) AS submit_rate
FROM sessions
GROUP BY lang
HAVING SUM(landed) >= 5   -- k-anonymity: 랜딩 5세션 미만 언어는 제외
ORDER BY SUM(landed) DESC;

-- ─────────────────────────────────────────────────────────────
-- View 2: foreign_exit_points
-- 경로별 이탈 — foreign_page_exit(2026-09-06 신설)의 scroll_depth·
-- time_on_page_sec을 집계. C안 하단 표.
--
-- 읽는 법: 깊이 30%↓ + 체류 15초↓ = 검색 의도와 콘텐츠 불일치.
--          깊이 70%↑인데 CTA 클릭 없음 = CTA 문제.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW foreign_exit_points
WITH (security_invoker = true) AS
SELECT
  properties->>'path'                                       AS path,
  lang,
  properties->>'page_kind'                                  AS page_kind,
  COUNT(*)::INT                                             AS exits,
  ROUND(AVG((properties->>'scroll_depth')::NUMERIC))        AS avg_scroll_depth,
  ROUND(AVG((properties->>'time_on_page_sec')::NUMERIC))    AS avg_time_sec
FROM user_events
WHERE event_name = 'foreign_page_exit'
  AND created_at >= now() - INTERVAL '30 days'
  AND properties->>'path' IS NOT NULL
  -- 숫자로 파싱 안 되는 값이 섞이면 AVG가 터진다 — 방어
  AND properties->>'scroll_depth' ~ '^[0-9]+$'
  AND properties->>'time_on_page_sec' ~ '^[0-9]+$'
GROUP BY 1, 2, 3
HAVING COUNT(*) >= 5   -- k-anonymity (기존 뷰들과 동일 기준)
ORDER BY COUNT(*) DESC
LIMIT 20;
