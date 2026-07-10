-- ============================================================================
-- Migration 440: notify_md_approval() null-safe 처리 (MD 승인 막힘 버그 수정)
-- 날짜: 2026-07-09
-- 문제: Migration 012의 notify_md_approval 트리거가 md_status→approved 시
--       function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-approval-sms'
--       로 URL을 만드는데, 프로덕션에서 app.settings.supabase_url이 NULL이라
--       function_url = NULL → net.http_post(url:=NULL)가 동기 에러 → AFTER UPDATE 트리거 실패
--       → users UPDATE(md_status=approved) 전체 롤백 → 관리자 MD 승인이 항상 실패(500).
--       (263/311/312에서 다른 알림 함수는 null-safe로 고쳤으나 012만 누락됨.)
-- 수정: GUC 미설정이면 발송을 조용히 스킵 + 알림 전체를 예외격리해 '승인 자체'를 절대 막지 않음.
--       (승인 알림톡은 API 라우트가 sendMDApprovedNotification로 이미 직접 발송하므로 이중 안전.)
-- 적용: 대시보드 SQL Editor 1회 실행.
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_md_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  IF OLD.md_status IS DISTINCT FROM 'approved' AND NEW.md_status = 'approved' THEN
    -- 알림은 부가기능 — 실패해도 승인 트랜잭션을 절대 막지 않도록 전체 예외격리
    BEGIN
      v_url := current_setting('app.settings.supabase_url', true);
      v_key := current_setting('app.settings.service_role_key', true);
      IF v_url IS NOT NULL AND v_url <> '' AND v_key IS NOT NULL AND v_key <> '' THEN
        PERFORM net.http_post(
          url := v_url || '/functions/v1/send-approval-sms',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
          ),
          body := jsonb_build_object(
            'type', 'UPDATE',
            'table', TG_TABLE_NAME,
            'record', jsonb_build_object(
              'id', NEW.id, 'name', NEW.name, 'phone', NEW.phone,
              'role', NEW.role, 'md_status', NEW.md_status
            ),
            'old_record', jsonb_build_object('md_status', OLD.md_status)
          )
        );
      ELSE
        RAISE NOTICE 'notify_md_approval: skipped (app.settings.supabase_url/service_role_key 미설정)';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'notify_md_approval: 발송 실패(무시) — %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 적용 후: 관리자 화면에서 MD 승인이 정상 동작해야 함(현호 등 pending → approved).
-- 검증(승인 1건 후): SELECT md_status FROM users WHERE id='<md>';  → 'approved'
-- ============================================================================
