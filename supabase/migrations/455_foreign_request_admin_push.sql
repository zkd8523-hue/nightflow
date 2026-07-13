-- ============================================================================
-- Migration 455: 외국인 요청 도착 시 운영팀(admin) 푸시 알림
--
-- foreign_requests INSERT → admin 전원에게 푸시.
-- ⚠️ notify_admins_push(Mig 311/164)를 사용 — vault에서 인증 읽고, 없으면 조용히 스킵,
--    net.http_post 실패도 호출자에 전파 안 함 → 푸시가 실패해도 INSERT는 절대 롤백 안 됨.
--    (notify_user_push per-user 루프는 http_request_queue url NULL로 INSERT를 막을 수 있어 사용 X)
-- 딥링크(/admin/foreign)는 data.url 로 전달.
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_admins_foreign_request()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM notify_admins_push(
    '🌏 새 외국인 요청',
    COALESCE(NEW.area, '클럽지정') || ' · ' || NEW.group_size::text || '명 · ' || to_char(NEW.event_date, 'MM/DD'),
    jsonb_build_object('type', 'foreign_request', 'id', NEW.id::text, 'url', '/admin/foreign')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS foreign_request_notify_admins ON foreign_requests;
CREATE TRIGGER foreign_request_notify_admins
  AFTER INSERT ON foreign_requests
  FOR EACH ROW EXECUTE FUNCTION notify_admins_foreign_request();
