-- ============================================================================
-- Migration 660: 외국인 방문자 목록 뷰 (사람 단위 드릴다운)
--
-- 배경: /admin/insights 외국인 섹션은 집계(나라별 전환율·단계)만 보여줘서
-- "그래서 누가 어디까지 갔나"를 개별로 볼 수 없었다. 이 뷰가 사람(anon_id)
-- 단위로 최대 도달 단계를 매기고, UI에서 한 명을 누르면 그 사람의 이벤트
-- 전체를 시간순으로 펼친다(저니 조회는 별도 서버 액션).
--
-- 왜 session_id가 아니라 anon_id인가: 외국인 트랙은 익명 제출을 허용해
-- user_id가 거의 없다. anon_id는 브라우저 단위라 "3일에 걸쳐 4번 왔다가
-- 결국 예약했다"는 재방문 패턴까지 한 줄로 묶인다.
--
-- 왜 폼 이상만 담나: 최근 17일 1,424세션 중 87%가 랜딩만 하고 나간다.
-- 그 사람들은 저니가 1줄이라 눌러볼 게 없다. 폼 이상 약 159명이 실제로
-- 들여다볼 가치가 있는 범위다.
-- ============================================================================

CREATE OR REPLACE VIEW foreign_visitor_list
WITH (security_invoker = true) AS
WITH per_visitor AS (
  SELECT
    anon_id,
    -- 한 사람이 언어를 바꿔 볼 수 있어서, 가장 많이 쓴 언어를 대표로
    MODE() WITHIN GROUP (ORDER BY lang) AS lang,
    COUNT(DISTINCT session_id)          AS visits,
    COUNT(*)                            AS events,
    MIN(created_at)                     AS first_seen,
    MAX(created_at)                     AS last_seen,
    -- 최대 도달 단계. 숫자가 클수록 깊이 들어간 사람.
    MAX(CASE
      WHEN event_name = 'foreign_request_submitted'  THEN 5
      WHEN event_name = 'foreign_trip_gate_qualified' THEN 4
      WHEN event_name = 'foreign_request_form_view'   THEN 3
      WHEN event_name IN (
        'foreign_book_at_club_click','foreign_club_page_click','foreign_guide_page_click',
        'foreign_info_page_click','foreign_sidebar_cta_click','foreign_plant_flag_click'
      ) THEN 2
      ELSE 1
    END) AS stage,
    -- 유입 채널 — 첫 세션 기준(광고 성과 판단용)
    (ARRAY_AGG(utm_source ORDER BY created_at))[1]  AS utm_source,
    (ARRAY_AGG(landing_path ORDER BY created_at))[1] AS landing_path
  FROM user_events
  WHERE created_at >= now() - INTERVAL '60 days'
    AND lang IS NOT NULL
    AND lang <> 'ko'
    AND anon_id IS NOT NULL
  GROUP BY anon_id
)
SELECT
  anon_id,
  lang,
  stage,
  CASE stage
    WHEN 5 THEN '제출' WHEN 4 THEN '게이트' WHEN 3 THEN '폼'
    WHEN 2 THEN 'CTA'  ELSE '랜딩'
  END AS stage_label,
  visits,
  events,
  first_seen,
  last_seen,
  utm_source,
  landing_path
FROM per_visitor
WHERE stage >= 3   -- 폼 이상 도달한 사람만(위 주석 참조)
ORDER BY stage DESC, last_seen DESC
LIMIT 300;
