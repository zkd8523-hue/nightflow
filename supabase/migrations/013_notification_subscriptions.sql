-- 013: 알림톡 알림 구독 및 발송 로그

-- 1. 경매 시작 알림 구독 테이블
CREATE TABLE auction_notify_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, auction_id)
);

CREATE INDEX idx_notify_subs_auction ON auction_notify_subscriptions(auction_id);
CREATE INDEX idx_notify_subs_user ON auction_notify_subscriptions(user_id);

ALTER TABLE auction_notify_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own subscriptions"
  ON auction_notify_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- 2. 알림 발송 로그 테이블 (중복 방지 + 디버깅)
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'auction_started', 'auction_won', 'payment_completed', 'visit_confirmed'
  )),
  auction_id UUID NOT NULL REFERENCES auctions(id),
  recipient_user_id UUID REFERENCES users(id),
  recipient_phone TEXT NOT NULL,
  template_id TEXT NOT NULL,
  solapi_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notify_logs_auction ON notification_logs(auction_id, event_type);
CREATE INDEX idx_notify_logs_created ON notification_logs(created_at);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read notification logs" ON notification_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Service Role Key를 사용하는 서버에서만 INSERT 가능 (RLS bypass)

-- 3. users 테이블에 알림 동의 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS alimtalk_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS alimtalk_consent_at TIMESTAMPTZ;
