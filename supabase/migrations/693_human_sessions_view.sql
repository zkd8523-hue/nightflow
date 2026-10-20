-- ============================================================================
-- Migration 693: human_sessions — 봇으로 보이는 세션을 뺀 분석용 세션 뷰
-- 날짜: 2026-10-11
--
-- 배경:
--   9/27 라인업 페이지가 생긴 뒤로 검색엔진 렌더러가 JS를 실행하며 referrer 없는
--   1이벤트 세션을 주 1,000건 넘게 남겼다(24시간 고른 분포, 지난 날짜 라인업에 균등 진입,
--   96%가 이벤트 1개). 주간 유입이 실제보다 크게 부풀어 보여 판단을 흐렸다.
--   광고 링크(utm_medium=cpc)로 왔는데 referrer가 없는 세션도 같은 분에 몰려 있고
--   전부 0초 — 구글 검수 봇·미리보기다.
--
--   앞으로 쌓이는 건 클라이언트에서 봇 UA·webdriver를 기록하지 않게 막았다
--   (src/lib/analytics/userEvents.ts isLikelyBot). 이 뷰는 이미 쌓인 기록까지 거른다.
--
-- 봇 판정(is_likely_bot): referrer가 없고, 아래 둘 중 하나
--   · 이벤트가 1개뿐
--   · 세션 길이 0초(같은 초에 끝남)
--   사람이 주소를 직접 쳐서 들어와 바로 나간 경우도 여기 걸리지만, 그런 세션은
--   행동 정보가 없어 분석에서 빠져도 잃는 게 없다. 앱(Capacitor)도 referrer가 없지만
--   보통 이벤트가 여러 개라 남는다.
--
-- 사용: 유입·전환 분석은 user_sessions 대신 human_sessions를 쓴다.
--   select count(*) from human_sessions where session_started_at >= now() - interval '7 days';
-- 뷰만 만든다 — 테이블·기존 뷰는 건드리지 않는다.
-- ============================================================================

CREATE OR REPLACE VIEW human_sessions AS
SELECT s.*
FROM user_sessions s
WHERE NOT (
  COALESCE(s.referrer, '') = ''
  AND (s.event_count <= 1 OR s.duration_seconds = 0)
);

COMMENT ON VIEW human_sessions IS
  '봇으로 보이는 세션(referrer 없음 + 이벤트 1개 또는 0초)을 뺀 user_sessions. 유입·전환 분석 기본 뷰 (Migration 693)';
