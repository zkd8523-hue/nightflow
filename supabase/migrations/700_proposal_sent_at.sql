-- Migration 700: 제안서 보낸 시각 (2026-11-01)
--
-- 어드민 "MD 답변 대기" 탭에 제안서를 아직 안 보낸 요청까지 섞여 있었고(클럽만 정해지면
-- 전부 대기로 분류), 언제 보냈는지 기록이 없어 "몇 시간째 무응답"인지 알 수 없었다.
-- notifyAssignedMd(kind=proposal)가 담당 MD에게 실제로 닿은(푸시 또는 문자) 시각을 찍는다.
-- 손님이 조건을 바꿔 다시 요청하면(booking-rerequest) 같은 함수를 타므로 시각이 갱신된다.
--
-- ⚠️ 이 마이그레이션을 먼저 적용한 뒤 코드를 배포한다 — 어드민 페이지가 이 컬럼을 select한다.

ALTER TABLE foreign_requests ADD COLUMN IF NOT EXISTS proposal_sent_at TIMESTAMPTZ;
ALTER TABLE korean_booking_requests ADD COLUMN IF NOT EXISTS proposal_sent_at TIMESTAMPTZ;

-- 기존 건 채우기 — notifyAssignedMd는 제안서를 보낼 때마다 담당 MD 벨 알림
-- (in_app_notifications, type=md_new_booking_proposal, action_url=/booking/proposal/{token})을
-- 항상 남긴다. 지금 담당 MD + 지금 토큰과 일치하는 가장 최근 기록을 보낸 시각으로 쓴다.
-- (담당이 바뀌면 토큰도 바뀌므로 이전 담당에게 보낸 기록은 자연히 걸러진다.)
UPDATE foreign_requests fr
SET proposal_sent_at = n.sent_at
FROM (
  SELECT user_id, action_url, MAX(created_at) AS sent_at
  FROM in_app_notifications
  WHERE type = 'md_new_booking_proposal'
  GROUP BY user_id, action_url
) n
WHERE fr.proposal_sent_at IS NULL
  AND fr.assigned_md_id = n.user_id
  AND n.action_url = '/booking/proposal/' || fr.proposal_token;

UPDATE korean_booking_requests kr
SET proposal_sent_at = n.sent_at
FROM (
  SELECT user_id, action_url, MAX(created_at) AS sent_at
  FROM in_app_notifications
  WHERE type = 'md_new_booking_proposal'
  GROUP BY user_id, action_url
) n
WHERE kr.proposal_sent_at IS NULL
  AND kr.assigned_md_id = n.user_id
  AND n.action_url = '/booking/proposal/' || kr.proposal_token;
