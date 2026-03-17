-- 068: 지역별 새 경매 알림 구독
-- 유저가 특정 지역(또는 전체)을 구독하면, 해당 지역에 새 경매 등록 시 알림톡 발송

-- 1. area_notify_subscriptions 테이블
CREATE TABLE area_notify_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area TEXT NOT NULL,  -- '강남', '홍대', '이태원', '건대', '전체'
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, area)
);

CREATE INDEX idx_area_notify_subs_area ON area_notify_subscriptions(area);
CREATE INDEX idx_area_notify_subs_user ON area_notify_subscriptions(user_id);

ALTER TABLE area_notify_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own area subscriptions"
  ON area_notify_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- 2. notification_logs event_type 확장
ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_event_type_check;
ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_event_type_check
  CHECK (event_type IN (
    'auction_started',
    'auction_won',
    'visit_confirmed',
    'outbid',
    'closing_soon',
    'noshow_penalty',
    'contact_deadline_warning',
    'fallback_won',
    'new_auction_in_area'
  ));
