-- ============================================================================
-- Migration 667: AI 어시스턴트 리퍼러 집계 (ChatGPT·Perplexity·Copilot·Gemini·Claude + Bing 검색)
--
-- 배경(2026-09-14): ChatGPT 리퍼러 세션이 7월 4 → 8월 9 → 9월 11로 늘고 Bing 유입도 137건.
-- 620만 원 예약 중 100만 원이 ChatGPT 경유였는데 /admin/insights에는 이 채널이 안 보였다
-- (acquisition_quality는 utm_source만 보고, AI 유입은 utm이 없거나 utm_source=chatgpt.com이라
-- '(direct)' 또는 별도 행에 묻힌다).
--
-- 분류 규칙(크리틱 1차 반영):
--   - ChatGPT는 인용 링크에 ?utm_source=chatgpt.com을 붙이고, 앱(데스크톱·iOS)은 리퍼러를 안 보낸다
--     → referrer OR utm_source 둘 다 본다.
--   - bing.com 리퍼러는 일반 Bing 검색과 Copilot-in-Bing이 구분 안 됨 → 'bing_search'로 따로 표기.
--   - Gemini는 gemini.google.com보다 vertexaisearch.cloud.google.com 리다이렉트로 더 자주 온다.
--   - Google AI Overviews/AI Mode는 리퍼러가 google.com이라 식별 불가(대시보드에 명시).
-- 월 단위 × 180일: 이 개편(답변형 블록) 전후 비교가 목적이라 롤링 30일 합계로는 부족하다.
-- k-anonymity 임계는 두지 않는다(월 십수 건 채널). 개인 식별 컬럼은 내지 않고 /profile·/settings 경로는 뺀다.
-- 전환은 폐기된 flag_created가 아니라 실제 예약 이벤트(foreign_request_submitted·booking_request_submitted).
-- ============================================================================

CREATE OR REPLACE FUNCTION ai_referral_source(p_referrer TEXT, p_utm_source TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_referrer ILIKE '%chatgpt.com%' OR p_referrer ILIKE '%openai.com%' OR p_utm_source ILIKE '%chatgpt%' THEN 'chatgpt'
    WHEN p_referrer ILIKE '%perplexity%' OR p_utm_source ILIKE '%perplexity%' THEN 'perplexity'
    WHEN p_referrer ILIKE '%copilot.microsoft%' OR p_utm_source ILIKE '%copilot%' THEN 'copilot'
    WHEN p_referrer ILIKE '%gemini.google%' OR p_referrer ILIKE '%vertexaisearch%' OR p_utm_source ILIKE '%gemini%' THEN 'gemini'
    WHEN p_referrer ILIKE '%claude.ai%' THEN 'claude'
    WHEN p_referrer ILIKE '%bing.com%' THEN 'bing_search'
  END
$$;

CREATE OR REPLACE VIEW ai_referral_sources
WITH (security_invoker = true) AS
WITH s AS (
  SELECT
    ai_referral_source(referrer, utm_source) AS source,
    date_trunc('month', session_started_at)::date AS month,
    anon_id, duration_seconds, event_count, event_sequence
  FROM user_sessions
  WHERE session_started_at >= now() - INTERVAL '180 days'
)
SELECT
  month,
  source,
  COUNT(*) AS session_count,
  COUNT(DISTINCT anon_id) AS unique_users,
  ROUND(AVG(duration_seconds)) AS avg_duration_sec,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds)::INT AS p50_duration_sec,
  ROUND(AVG(event_count), 1) AS avg_events,
  -- 예약 제출: 외국인 폼(foreign_request_submitted) + 한국인 폼(booking_request_submitted, 2026-09-14 배선).
  -- 그 전 세션의 한국인 예약은 이벤트가 없어 0으로 보인다 → 예약 버튼 클릭(book_click_count)을 같이 낸다.
  COUNT(*) FILTER (WHERE 'foreign_request_submitted' = ANY(event_sequence) OR 'booking_request_submitted' = ANY(event_sequence)) AS booking_count,
  COUNT(*) FILTER (WHERE 'club_detail_book_click' = ANY(event_sequence) OR 'foreign_book_at_club_click' = ANY(event_sequence)) AS book_click_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE event_count = 1) / NULLIF(COUNT(*), 0), 1) AS bounce_rate
FROM s
WHERE source IS NOT NULL
GROUP BY month, source
ORDER BY month DESC, session_count DESC;

COMMENT ON VIEW ai_referral_sources IS
  '최근 180일 월별 AI 어시스턴트(ChatGPT·Perplexity·Copilot·Gemini·Claude) + Bing 검색 리퍼러 세션 품질. Admin 대시보드용.';

-- 어느 페이지로 보내는가 — "인용되는 페이지" 목록. 클럽 상세는 이름을 붙인다(UUID만으론 못 읽는다).
CREATE OR REPLACE VIEW ai_referral_landings
WITH (security_invoker = true) AS
WITH s AS (
  SELECT
    ai_referral_source(referrer, utm_source) AS source,
    date_trunc('month', session_started_at)::date AS month,
    landing_path
  FROM user_sessions
  WHERE session_started_at >= now() - INTERVAL '180 days'
    AND landing_path IS NOT NULL
    AND landing_path NOT LIKE '/profile%'
    AND landing_path NOT LIKE '/settings%'
    AND landing_path NOT LIKE '/admin%'
),
agg AS (
  SELECT month, source, landing_path, COUNT(*) AS session_count
  FROM s WHERE source IS NOT NULL
  GROUP BY month, source, landing_path
),
ranked AS (
  SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.month, a.source ORDER BY a.session_count DESC, a.landing_path) AS rn
  FROM agg a
)
SELECT
  r.month,
  r.source,
  r.landing_path,
  c.name AS club_name,
  r.session_count
FROM ranked r
LEFT JOIN clubs c
  ON r.landing_path ~ '^/clubs/[0-9a-f-]{36}$'
 AND c.id::text = substring(r.landing_path from '^/clubs/([0-9a-f-]{36})$')
WHERE r.rn <= 8
ORDER BY r.month DESC, r.source, r.session_count DESC;

COMMENT ON VIEW ai_referral_landings IS
  '최근 180일 월별 AI 리퍼러 × 착지 경로 상위 8개(월·소스별). 클럽 상세는 클럽명 포함.';
