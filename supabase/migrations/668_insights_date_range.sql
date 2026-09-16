-- ============================================================================
-- Migration 668: 외국인 퍼널 인사이트에 기간 필터 추가
--
-- 배경(2026-09-16): 658·663 뷰들이 기간을 30·60일로 하드코딩해서, 개선 전후를
-- 나눠 볼 수 없었다. 오늘 광고 랜딩(/book)·날짜 UI·클럽 그리드 버그를 고쳤는데
-- 그 효과가 개편 전 두 달 데이터에 묻힌다. 운영자 요청: "오늘거부터 볼 수 있게".
--
-- 데이터를 지우지 않는다 — 기존 데이터는 비교 기준선으로 남긴다.
-- 뷰를 함수(_since)로 감싸 호출 시점에 시작일을 받는다.
--
-- 기존 뷰는 그대로 둔다(다른 화면·SQL이 쓸 수 있고, 기본 기간 조회는 여전히 유효).
--
-- 원칙은 기존 뷰와 동일:
--   - SECURITY INVOKER (기본) — 호출자 권한으로 user_events를 읽어 RLS가 그대로 적용
--   - k-anonymity 임계(랜딩 5세션·이탈 5건) 유지
--   - STABLE — 같은 트랜잭션 안에서 결과가 바뀌지 않음
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 1) 언어 × 퍼널 단계 (658 View 1의 기간 인자 버전)
-- ⚠️ 단계 간 비율로 계산하면 안 된다 — 전부 랜딩 대비다(658 주석 참조).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION foreign_funnel_by_lang_since(p_since TIMESTAMPTZ)
RETURNS TABLE (
  lang TEXT, landed INT, cta_clicked INT, form_viewed INT, gate_passed INT, submitted INT,
  cta_rate NUMERIC, form_rate NUMERIC, gate_rate NUMERIC, submit_rate NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH sessions AS (
    SELECT
      e.lang,
      e.session_id,
      MAX(CASE WHEN e.event_name IN (
        'foreign_club_page_view','foreign_guide_page_view','foreign_info_page_view',
        'foreign_clubs_view','en_home_view','ja_home_view','zh_home_view','zh_tw_home_view'
      ) THEN 1 ELSE 0 END) AS landed,
      MAX(CASE WHEN e.event_name IN (
        'foreign_book_at_club_click','foreign_club_page_click','foreign_guide_page_click',
        'foreign_info_page_click','foreign_sidebar_cta_click','foreign_plant_flag_click'
      ) THEN 1 ELSE 0 END) AS cta_clicked,
      MAX(CASE WHEN e.event_name = 'foreign_request_form_view' THEN 1 ELSE 0 END) AS form_viewed,
      MAX(CASE WHEN e.event_name = 'foreign_trip_gate_qualified' THEN 1 ELSE 0 END) AS gate_passed,
      MAX(CASE WHEN e.event_name = 'foreign_request_submitted' THEN 1 ELSE 0 END) AS submitted
    FROM user_events e
    WHERE e.created_at >= p_since
      AND e.lang IS NOT NULL
      AND e.lang <> 'ko'
      AND e.session_id IS NOT NULL
    GROUP BY e.lang, e.session_id
  )
  SELECT
    s.lang,
    SUM(s.landed)::INT, SUM(s.cta_clicked)::INT, SUM(s.form_viewed)::INT,
    SUM(s.gate_passed)::INT, SUM(s.submitted)::INT,
    ROUND(100.0 * SUM(s.cta_clicked) / NULLIF(SUM(s.landed), 0), 1),
    ROUND(100.0 * SUM(s.form_viewed) / NULLIF(SUM(s.landed), 0), 1),
    ROUND(100.0 * SUM(s.gate_passed) / NULLIF(SUM(s.landed), 0), 1),
    ROUND(100.0 * SUM(s.submitted)  / NULLIF(SUM(s.landed), 0), 2)
  FROM sessions s
  GROUP BY s.lang
  HAVING SUM(s.landed) >= 5   -- k-anonymity
  ORDER BY SUM(s.landed) DESC;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2) 경로별 이탈 (658 View 2)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION foreign_exit_points_since(p_since TIMESTAMPTZ)
RETURNS TABLE (
  path TEXT, lang TEXT, page_kind TEXT, exits INT,
  avg_scroll_depth NUMERIC, avg_time_sec NUMERIC
)
LANGUAGE sql STABLE AS $$
  SELECT
    e.properties->>'path',
    e.lang,
    e.properties->>'page_kind',
    COUNT(*)::INT,
    ROUND(AVG((e.properties->>'scroll_depth')::NUMERIC)),
    ROUND(AVG((e.properties->>'time_on_page_sec')::NUMERIC))
  FROM user_events e
  WHERE e.event_name = 'foreign_page_exit'
    AND e.created_at >= p_since
    AND e.properties->>'path' IS NOT NULL
    AND e.properties->>'scroll_depth' ~ '^[0-9]+$'
    AND e.properties->>'time_on_page_sec' ~ '^[0-9]+$'
  GROUP BY 1, 2, 3
  HAVING COUNT(*) >= 5   -- k-anonymity
  ORDER BY COUNT(*) DESC
  LIMIT 20;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) 폼 필드별 진행 (663) — 정렬은 폼 진행 순서 고정
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION foreign_form_field_progress_since(p_since TIMESTAMPTZ)
RETURNS TABLE (field TEXT, sessions INT)
LANGUAGE sql STABLE AS $$
  SELECT
    e.properties->>'field',
    COUNT(DISTINCT e.session_id)::INT
  FROM user_events e
  WHERE e.event_name = 'foreign_form_field_completed'
    AND e.created_at >= p_since
    AND e.properties->>'field' IS NOT NULL
  GROUP BY 1
  ORDER BY
    CASE e.properties->>'field'
      WHEN 'date' THEN 1 WHEN 'club' THEN 2 WHEN 'menu' THEN 3
      WHEN 'name' THEN 4 WHEN 'contact' THEN 5 ELSE 6
    END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4) 제출 차단 사유 (663)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION foreign_form_submit_blocks_since(p_since TIMESTAMPTZ)
RETURNS TABLE (reason TEXT, blocks INT, sessions INT)
LANGUAGE sql STABLE AS $$
  SELECT
    e.properties->>'reason',
    COUNT(*)::INT,
    COUNT(DISTINCT e.session_id)::INT
  FROM user_events e
  WHERE e.event_name = 'foreign_form_submit_blocked'
    AND e.created_at >= p_since
    AND e.properties->>'reason' IS NOT NULL
  GROUP BY 1
  ORDER BY COUNT(*) DESC;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5) 언어별 마지막 이벤트(이탈 지점) — 414의 dropoff_by_lang 기간 인자 버전.
--    ko는 외국인 트랙 진단에서 빼둔다(414 뷰는 포함하지만 이 화면 목적과 안 맞음).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dropoff_by_lang_since(p_since TIMESTAMPTZ)
RETURNS TABLE (lang TEXT, last_event TEXT, sessions INT, total_sessions INT, pct NUMERIC)
LANGUAGE sql STABLE AS $$
  WITH s AS (
    SELECT
      e.lang,
      e.session_id,
      (ARRAY_AGG(e.event_name ORDER BY e.created_at DESC))[1] AS last_event
    FROM user_events e
    WHERE e.created_at >= p_since
      AND e.lang IS NOT NULL
      AND e.lang <> 'ko'
      AND e.session_id IS NOT NULL
    GROUP BY e.lang, e.session_id
  ),
  tot AS (SELECT s.lang, COUNT(*)::INT AS total FROM s GROUP BY s.lang)
  SELECT
    s.lang,
    s.last_event,
    COUNT(*)::INT,
    t.total,
    ROUND(100.0 * COUNT(*) / NULLIF(t.total, 0), 1)
  FROM s
  JOIN tot t ON t.lang = s.lang
  GROUP BY s.lang, s.last_event, t.total
  ORDER BY t.total DESC, COUNT(*) DESC;
$$;

COMMENT ON FUNCTION foreign_funnel_by_lang_since IS
  '언어×퍼널 단계. p_since 이후만 집계 — 개선 전후 비교용(Migration 668).';
COMMENT ON FUNCTION dropoff_by_lang_since IS
  '언어별 마지막 이벤트(이탈 지점). p_since 이후, ko 제외(Migration 668).';

-- ─────────────────────────────────────────────────────────────
-- 6) 광고 전용 랜딩(/book) 성과 — Migration 668 추가분
--
-- 왜 따로 필요한가: 퍼널 함수는 모든 info 페이지(vip-tables·halloween·faq…)를
-- 한 덩어리로 세서 "광고 랜딩의 CTA 클릭률"을 분리할 수 없다. 그 숫자가
-- 랜딩 교체의 유일한 판단 근거다(기존 홈 랜딩 실측: CTA 2%, 0초 이탈 90%).
--
-- 경로로 식별한다(path LIKE '%/book') — properties->>'page'='ad-book'도 같이 들어오지만
-- 경로가 더 확실하고, 언어별 4개 라우트를 한 번에 잡는다.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ad_landing_performance(p_since TIMESTAMPTZ)
RETURNS TABLE (
  lang TEXT,
  sessions INT,
  cta_clicks INT,
  cta_rate NUMERIC,
  reached_form INT,
  form_rate NUMERIC,
  instant_exits INT,
  instant_exit_rate NUMERIC,
  avg_scroll_depth NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH book AS (
    -- /book을 본 세션만 — 같은 세션이 나중에 폼까지 갔는지는 아래에서 이어 본다
    SELECT DISTINCT e.session_id, e.lang
    FROM user_events e
    WHERE e.created_at >= p_since
      AND e.path LIKE '%/book'
      AND e.event_name = 'foreign_info_page_view'
      AND e.session_id IS NOT NULL
  ),
  per_session AS (
    SELECT
      b.lang,
      b.session_id,
      -- CTA: /book 안에서 누른 클릭만 센다
      MAX(CASE WHEN e.event_name = 'foreign_info_page_click' AND e.path LIKE '%/book' THEN 1 ELSE 0 END) AS clicked,
      -- 폼 도달은 경로 무관(클릭 후 /flags/new로 이동하므로)
      MAX(CASE WHEN e.event_name = 'foreign_request_form_view' THEN 1 ELSE 0 END) AS formed,
      -- 0초 이탈: 이 세션의 이벤트가 /book 진입 1개뿐
      COUNT(*) AS events,
      -- 스크롤 깊이는 이탈 이벤트에만 실린다
      MAX(CASE WHEN e.event_name = 'foreign_page_exit' AND e.properties->>'scroll_depth' ~ '^[0-9]+$'
               THEN (e.properties->>'scroll_depth')::NUMERIC END) AS depth
    FROM book b
    JOIN user_events e ON e.session_id = b.session_id AND e.created_at >= p_since
    GROUP BY b.lang, b.session_id
  )
  SELECT
    s.lang,
    COUNT(*)::INT,
    SUM(s.clicked)::INT,
    ROUND(100.0 * SUM(s.clicked) / NULLIF(COUNT(*), 0), 1),
    SUM(s.formed)::INT,
    ROUND(100.0 * SUM(s.formed) / NULLIF(COUNT(*), 0), 1),
    COUNT(*) FILTER (WHERE s.events = 1)::INT,
    ROUND(100.0 * COUNT(*) FILTER (WHERE s.events = 1) / NULLIF(COUNT(*), 0), 1),
    ROUND(AVG(s.depth))
  FROM per_session s
  GROUP BY s.lang
  ORDER BY COUNT(*) DESC;
$$;

COMMENT ON FUNCTION ad_landing_performance IS
  '광고 전용 랜딩(/book) 언어별 성과 — CTA 클릭률·폼 도달·0초 이탈률. 홈 랜딩 기준선: CTA 2%, 0초 이탈 90%(Migration 668).';
