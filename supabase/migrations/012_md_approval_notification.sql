-- MD 승인 시 자동 SMS 발송 트리거
-- md_status가 'approved'로 변경되면 Edge Function 호출

-- 1. Edge Function 호출을 위한 pg_net 확장 활성화 (이미 활성화되어 있을 수 있음)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. MD 승인 알림 함수
CREATE OR REPLACE FUNCTION notify_md_approval()
RETURNS TRIGGER AS $$
DECLARE
  function_url TEXT;
  payload JSONB;
BEGIN
  -- md_status가 'approved'로 변경되었을 때만 실행
  IF OLD.md_status IS DISTINCT FROM 'approved' AND NEW.md_status = 'approved' THEN

    -- Supabase Edge Function URL (프로젝트 URL로 변경 필요)
    function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-approval-sms';

    -- Webhook 페이로드 생성
    payload := jsonb_build_object(
      'type', 'UPDATE',
      'table', TG_TABLE_NAME,
      'record', jsonb_build_object(
        'id', NEW.id,
        'name', NEW.name,
        'phone', NEW.phone,
        'role', NEW.role,
        'md_status', NEW.md_status
      ),
      'old_record', jsonb_build_object(
        'md_status', OLD.md_status
      )
    );

    -- Edge Function 비동기 호출
    PERFORM net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := payload
    );

    -- 로그 기록 (선택사항)
    RAISE NOTICE 'MD 승인 알림 발송: % (%)', NEW.name, NEW.phone;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger 생성 (users 테이블 UPDATE 시)
DROP TRIGGER IF EXISTS md_approval_notification_trigger ON users;

CREATE TRIGGER md_approval_notification_trigger
  AFTER UPDATE OF md_status ON users
  FOR EACH ROW
  EXECUTE FUNCTION notify_md_approval();

-- 4. 설정값 저장 (실제 배포 시 값 변경 필요)
-- 주의: 이 값들은 Supabase Dashboard에서 설정하거나, 환경변수로 관리해야 합니다
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';

COMMENT ON FUNCTION notify_md_approval() IS 'MD 승인 시 SMS 알림 자동 발송';
COMMENT ON TRIGGER md_approval_notification_trigger ON users IS 'md_status가 approved로 변경될 때 알림 발송';
