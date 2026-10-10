-- ============================================================================
-- Migration 692: MD 정산 자동 리마인드 cron — 매월 7일·10일 10:00 KST
-- 날짜: 2026-10-10
--
-- /api/cron/settlement-reminders(Vercel)를 호출한다. 7일 = 미리 안내, 10일 = 기한 당일.
-- 대상: 지난달 정산분 중 운영자가 안내(①)를 직접 보냈고 정산 완료 체크가 안 된 MD.
-- 인증은 다른 cron과 같은 vault의 service_role_key(라우트가 SUPABASE_SERVICE_ROLE_KEY와 비교).
-- 테이블 변경 없음 — 자동 발송은 settlement_notices에 sent_by = NULL로 남는다(682).
--
-- ⚠️ 코드(라우트) 배포가 먼저다. 라우트 없이 적용하면 7·10일에 404만 난다(피해는 없음).
-- 끄려면: SELECT cron.unschedule('settlement-reminders');
-- ============================================================================

DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname = 'settlement-reminders'
  LOOP PERFORM cron.unschedule(v_jobid); END LOOP;
END $$;

SELECT cron.schedule(
  'settlement-reminders',
  '0 1 7,10 * *', -- 매월 7·10일 01:00 UTC = 10:00 KST
  $$
  SELECT net.http_post(
    url := 'https://nightflow.kr/api/cron/settlement-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
