-- Migration 263: notify_user_push() 안전화
-- app.settings.supabase_url / service_role_key 가 NULL 이면 push 전송을 조용히 스킵.
-- net.http_post 호출 자체도 EXCEPTION으로 감싸 외부 트랜잭션 영향 X.

CREATE OR REPLACE FUNCTION notify_user_push(
  p_user_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB,
  p_url TEXT,
  p_category TEXT
)
RETURNS VOID AS $$
DECLARE
  v_url TEXT;
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_body JSONB;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  -- 카테고리 토글 + 방해금지 체크
  IF NOT can_send_push(p_user_id, p_category) THEN
    RETURN;
  END IF;

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  -- 설정 누락 시 조용히 스킵 (인앱 알림은 다른 경로로 처리됨)
  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE NOTICE 'notify_user_push: skipped (app.settings.supabase_url or service_role_key missing)';
    RETURN;
  END IF;

  v_url := v_supabase_url || '/functions/v1/push-dispatch';
  v_body := jsonb_build_object(
    'user_id', p_user_id::TEXT,
    'title', p_title,
    'body', p_body,
    'data', p_data
  );
  IF p_url IS NOT NULL THEN
    v_body := v_body || jsonb_build_object('url', p_url);
  END IF;

  -- net.http_post 실패해도 호출자에 에러 전파 X
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := v_body
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_user_push: net.http_post failed: %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION notify_user_push(UUID, TEXT, TEXT, JSONB, TEXT, TEXT) IS
  '푸시 알림 발송 (설정 누락 시 조용히 스킵, net.http_post 실패도 무시).';
