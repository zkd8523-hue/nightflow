-- Migration 531: 회원가입 퍼널(signup_funnel) 집계 창을 오늘부터로 리셋
--
-- 배경: 오늘(2026-08-06) 회원가입 퍼널 마지막 단계(닉네임/성별/OTP) 마찰 제거 배포.
--      signup_funnel 뷰는 "최근 7일" 롤링 윈도우라, 배포 전 이탈 데이터가 섞여서
--      개선 효과를 바로 확인하기 어려움.
--
-- 처리: user_events 원본 데이터는 전혀 건드리지 않음(삭제/변경 없음, 비파괴적).
--      뷰의 WHERE 절만 GREATEST(now()-7일, 오늘 00:00 KST)로 바꿔서 하한선을 오늘로 고정.
--      2026-08-13(오늘+7일) 이후엔 now()-7일 쪽이 자연히 더 늦어져서 별도 조치 없이
--      원래의 순수 롤링 7일 창으로 자동 복귀함(self-healing).
--
-- ⚠️ 이 파일은 여러 번 실행해도 안전 (CREATE OR REPLACE VIEW).

CREATE OR REPLACE VIEW signup_funnel
WITH (security_invoker = true) AS
WITH stages AS (
  SELECT
    COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'signup_start') AS step1_start,
    COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'signup_agree') AS step2_agree,
    COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'signup_phone_verified') AS step3_phone,
    COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'signup_completed') AS step4_completed
  FROM user_events
  WHERE created_at >= GREATEST(now() - INTERVAL '7 days', '2026-08-06 00:00:00+09'::timestamptz)
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
  '회원가입 5단계 퍼널 전환률. 2026-08-13까지는 2026-08-06(퍼널 개선 배포일) 00:00 KST부터 집계, 이후 순수 롤링 7일로 자동 복귀.';
