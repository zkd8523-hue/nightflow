-- Migration 702: 제안서 무응답 운영자 알림 횟수 (2026-11-01)
--
-- 운영자 푸시를 한 번이 아니라 단계별로 보낸다(사용자 결정):
--   당일 요청 → 15분 1회(담당 MD 재알림 + 운영자)
--   그 외     → 3시간(담당 MD 재알림 + 운영자) · 6시간 · 24시간(운영자만)
-- proposal_admin_alerts = 지금까지 보낸 운영자 알림 수. 제안서를 새로 보내거나 담당이 바뀌면 0으로.
-- proposal_reminded_at(701)은 담당 MD 재알림 시각으로 그대로 쓴다.
--
-- ⚠️ 코드 배포보다 먼저 적용한다 — /api/cron/proposal-reminders가 이 컬럼을 읽고 쓴다.

ALTER TABLE foreign_requests ADD COLUMN IF NOT EXISTS proposal_admin_alerts SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE korean_booking_requests ADD COLUMN IF NOT EXISTS proposal_admin_alerts SMALLINT NOT NULL DEFAULT 0;
