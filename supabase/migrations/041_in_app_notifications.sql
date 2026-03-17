-- 041: 인앱 알림 시스템
-- MD 승인/거절 시 앱 내 알림 자동 생성

-- 1. 인앱 알림 테이블
CREATE TABLE in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user ON in_app_notifications(user_id, is_read, created_at DESC);

ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications" ON in_app_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON in_app_notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE in_app_notifications;

-- 2. MD 상태 변경 시 인앱 알림 자동 생성 함수
CREATE OR REPLACE FUNCTION notify_md_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- 승인
  IF OLD.md_status IS DISTINCT FROM 'approved' AND NEW.md_status = 'approved' THEN
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.id,
      'md_approved',
      'MD 파트너 승인 완료',
      '축하합니다! MD 파트너 신청이 승인되었습니다. 지금 바로 경매를 등록해보세요.',
      '/md/dashboard'
    );
  END IF;

  -- 거절
  IF OLD.md_status IS DISTINCT FROM 'rejected' AND NEW.md_status = 'rejected' THEN
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.id,
      'md_rejected',
      'MD 파트너 신청 결과',
      'MD 파트너 신청이 반려되었습니다. 사유: ' || COALESCE(NEW.md_rejection_reason, '사유 미기재'),
      '/md/apply'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 트리거 생성 (기존 SMS 트리거와 별도)
-- 기존 md_approval_notification_trigger는 SMS 전용으로 유지
CREATE TRIGGER md_status_change_in_app_trigger
  AFTER UPDATE OF md_status ON users
  FOR EACH ROW
  EXECUTE FUNCTION notify_md_status_change();

COMMENT ON TABLE in_app_notifications IS '인앱 알림 (모든 계정 공통)';
COMMENT ON FUNCTION notify_md_status_change() IS 'MD 승인/거절 시 인앱 알림 자동 생성';
