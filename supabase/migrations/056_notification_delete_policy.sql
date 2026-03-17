-- 056: 인앱 알림 DELETE 정책 추가
-- 기존 041에서 SELECT/UPDATE만 정의되어 사용자가 알림을 삭제할 수 없었음

CREATE POLICY "Users can delete own notifications" ON in_app_notifications
  FOR DELETE USING (auth.uid() = user_id);
