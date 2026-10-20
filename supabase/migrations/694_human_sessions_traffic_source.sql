-- ============================================================================
-- Migration 694: human_sessions에 traffic_source(유입 경로 분류) 컬럼 추가
-- 날짜: 2026-10-20
--
-- 배경:
--   ChatGPT 링크는 referrer 없이 ?utm_source=chatgpt.com만 달고 온다. referrer만 보고
--   분류하면 전부 "직접 유입"으로 잡혀, 외국인 트랙에서 전환율이 가장 높은 경로(9/7~10/20
--   세션당 0.9%, 구글 0.08%)가 안 보였다 — 10/16·10/18 Lion Super Club 요청 2건이 그랬다.
--   분석할 때마다 손으로 분류하지 않게 뷰에서 한 번에 정한다.
--
-- 분류 순서(위가 우선):
--   ad        utm_medium = 'cpc'
--   ai        utm_source가 chatgpt.com·openai·gemini·perplexity·copilot·claude, 또는 그 referrer
--   instagram utm_source ig·instagram·threads, 또는 instagram·threads referrer
--   google    google referrer
--   naver     naver referrer
--   search    그 밖의 검색엔진(bing·duckduckgo·yahoo·baidu·daum·ecosia·yandex)
--   internal  nightflow referrer
--   direct    referrer 없음
--   other     나머지
--
-- 693 봇 제외 조건에 한 가지를 고친다: referrer 없이 utm_source만 있는 세션(ChatGPT 등)은
-- 이벤트가 1개여도 사람으로 본다. 컬럼은 끝에 붙인다(CREATE OR REPLACE VIEW는 끝 컬럼 추가 허용).
-- ============================================================================

CREATE OR REPLACE VIEW human_sessions AS
SELECT
  s.*,
  CASE
    WHEN s.utm_medium = 'cpc' THEN 'ad'
    WHEN lower(coalesce(s.utm_source, '')) IN ('chatgpt.com', 'openai', 'gemini', 'perplexity', 'copilot', 'claude')
      OR s.referrer ~* '(chatgpt|openai|perplexity|gemini\.google|copilot|claude\.ai)' THEN 'ai'
    WHEN lower(coalesce(s.utm_source, '')) IN ('ig', 'instagram', 'threads')
      OR s.referrer ~* '(instagram|threads\.net)' THEN 'instagram'
    WHEN s.referrer ~* 'google\.' THEN 'google'
    WHEN s.referrer ~* 'naver\.' THEN 'naver'
    WHEN s.referrer ~* '(bing\.|duckduckgo|yahoo\.|baidu\.|daum\.|ecosia|yandex)' THEN 'search'
    WHEN s.referrer ~* 'nightflow' THEN 'internal'
    WHEN coalesce(s.referrer, '') = '' THEN 'direct'
    ELSE 'other'
  END AS traffic_source
FROM user_sessions s
WHERE NOT (
  COALESCE(s.referrer, '') = ''
  AND (s.event_count <= 1 OR s.duration_seconds = 0)
  -- referrer 없이 utm만 달고 오는 실제 유입(ChatGPT 등)은 1이벤트여도 남긴다.
  -- 광고(cpc)는 예외 — referrer 없는 광고 세션은 구글 검수 봇이었다(같은 분 3건씩, 전부 0초).
  AND (COALESCE(s.utm_source, '') IN ('', 'direct', 'organic') OR s.utm_medium = 'cpc')
);

COMMENT ON VIEW human_sessions IS
  '봇으로 보이는 세션(referrer 없음 + 이벤트 1개 또는 0초)을 뺀 user_sessions + traffic_source(ad·ai·instagram·google·naver·search·internal·direct·other). 유입·전환 분석 기본 뷰 (Migration 693·694)';
