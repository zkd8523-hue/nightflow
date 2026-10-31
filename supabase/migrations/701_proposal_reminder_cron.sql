-- ============================================================================
-- Migration 701: 제안서 무응답 재알림 — 5분마다 확인 (2026-11-01)
--
-- 제안서를 보냈는데(proposal_sent_at, Migration 700) 담당 MD 답이 없으면
--   당일 요청(영업일 기준, 새벽 6시 경계) → 15분, 그 외 → 3시간 뒤
-- 담당 MD에게 한 번 더 알리고 운영자(role=admin)에게 푸시한다. 한 건당 한 번만.
-- /api/cron/proposal-reminders(Vercel)를 호출한다. 인증은 다른 cron과 같은 vault의 service_role_key.
--
-- proposal_reminded_at: 재알림을 보낸 시각. 제안서를 새로 보내거나(재촉·손님 재요청)
-- 담당이 바뀌면 NULL로 돌아가 다시 한 번 재알림 대상이 된다.
--
-- ⚠️ 이 마이그레이션을 코드 배포보다 먼저 적용한다 — 라우트·알림 함수가 proposal_reminded_at을 쓴다.
--    라우트 배포 전까지는 cron이 404만 받는다(피해 없음).
-- 끄려면: SELECT cron.unschedule('proposal-reminders');
-- ============================================================================

ALTER TABLE foreign_requests ADD COLUMN IF NOT EXISTS proposal_reminded_at TIMESTAMPTZ;
ALTER TABLE korean_booking_requests ADD COLUMN IF NOT EXISTS proposal_reminded_at TIMESTAMPTZ;

DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname = 'proposal-reminders'
  LOOP PERFORM cron.unschedule(v_jobid); END LOOP;
END $$;

SELECT cron.schedule(
  'proposal-reminders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nightflow.kr/api/cron/proposal-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
