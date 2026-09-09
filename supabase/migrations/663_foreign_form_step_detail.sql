-- ============================================================================
-- Migration 663: 게이트 통과 후 폼 단계 세부 뷰 2개
--
-- 배경: foreign_funnel_by_lang은 게이트 통과(gate_passed) → 제출(submitted)
-- 딱 두 단계뿐이라 "게이트 다음이 너무 약하다" — 그 사이에서 정확히 어느
-- 입력(날짜/클럽/메뉴/이름/연락처)에서 막히는지, 제출을 시도했다가 어떤
-- 검증에 걸려 못 냈는지가 안 보였다.
--
-- 재료: e52f64a1(2026-09-09)에서 이미 심어둔 두 이벤트를 씀 —
--   foreign_form_field_completed { field: date|club|menu|name|contact }
--   foreign_form_submit_blocked  { reason: no_date|no_club|... }
--
-- ⚠️ 전체 표본이 작다(게이트 통과 26건대). 기존 뷰들의 k-anonymity
-- HAVING(>=5)을 그대로 적용하면 전부 필터링돼 빈 화면이 된다. 여기선
-- HAVING을 빼고 언어 구분 없이 전체로 집계한다 — 개인 식별 위험이 낮은
-- "필드 이름"·"차단 이유" 단위 집계라 5건 미만도 노출한다.
-- ============================================================================

CREATE OR REPLACE VIEW foreign_form_field_progress
WITH (security_invoker = true) AS
SELECT
  properties->>'field'                                       AS field,
  COUNT(DISTINCT session_id)::INT                            AS sessions
FROM user_events
WHERE event_name = 'foreign_form_field_completed'
  AND created_at >= now() - INTERVAL '60 days'
  AND properties->>'field' IS NOT NULL
GROUP BY 1
ORDER BY
  -- 폼 진행 순서(날짜→클럽→메뉴→이름→연락처)로 고정 정렬 — COUNT 내림차순이면
  -- 병목이 아니라 값이 널뛰어서 읽기 어려워진다.
  CASE properties->>'field'
    WHEN 'date' THEN 1 WHEN 'club' THEN 2 WHEN 'menu' THEN 3
    WHEN 'name' THEN 4 WHEN 'contact' THEN 5 ELSE 6
  END;

CREATE OR REPLACE VIEW foreign_form_submit_blocks
WITH (security_invoker = true) AS
SELECT
  properties->>'reason'                                      AS reason,
  COUNT(*)::INT                                               AS blocks,
  COUNT(DISTINCT session_id)::INT                             AS sessions
FROM user_events
WHERE event_name = 'foreign_form_submit_blocked'
  AND created_at >= now() - INTERVAL '60 days'
  AND properties->>'reason' IS NOT NULL
GROUP BY 1
ORDER BY COUNT(*) DESC;
