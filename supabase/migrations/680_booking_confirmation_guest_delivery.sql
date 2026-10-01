-- 680: 확정서 손님 전달 상태 기록
--
-- "확정서 보내기"는 손님에게 앱 푸시 + 벨(인앱) 알림만 보냈는데, 앱이 없는 손님은
-- 푸시 토큰이 없어 아무것도 못 받았다. 운영자는 보냈다고 믿었고 확인할 방법도
-- 없었다(2026-10-01, LR-4815·LR-9679 두 건 모두 손님 미수신).
--
-- guest_notified_at    : 손님 알림을 마지막으로 보낸 시각
-- guest_notify_channel : push(앱 푸시) · sms(문자 링크) · none(벨만 남음 = 사실상 미전달)
-- guest_viewed_at      : 손님이 확정서(/booking/{token})를 처음 연 시각
--                        (어드민·담당 MD가 연 건 제외, 링크 미리보기 크롤러 제외)

ALTER TABLE booking_confirmations
  ADD COLUMN IF NOT EXISTS guest_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guest_notify_channel TEXT
    CHECK (guest_notify_channel IS NULL OR guest_notify_channel IN ('push', 'sms', 'none')),
  ADD COLUMN IF NOT EXISTS guest_viewed_at TIMESTAMPTZ;

-- 이미 "확정서 보내기"를 누른 건 백필 — 손님 벨 알림(action_url=/booking/{token})이
-- 남아 있으면 보낸 것으로 보고, 그 손님에게 푸시 토큰이 있었는지로 채널을 추정한다.
UPDATE booking_confirmations bc
SET guest_notified_at = n.created_at,
    guest_notify_channel = CASE
      WHEN EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = n.user_id) THEN 'push'
      ELSE 'none'
    END
FROM (
  SELECT DISTINCT ON (action_url) action_url, user_id, created_at
  FROM in_app_notifications
  WHERE action_url LIKE '/booking/%'
    AND action_url NOT LIKE '/booking/md/%'
    AND action_url NOT LIKE '/booking/proposal/%'
  ORDER BY action_url, created_at DESC
) n
WHERE n.action_url = '/booking/' || bc.public_token
  AND bc.guest_notified_at IS NULL;
