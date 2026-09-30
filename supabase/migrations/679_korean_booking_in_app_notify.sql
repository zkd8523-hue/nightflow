-- ============================================================================
-- Migration 679: 한국 예약 접수/확정 인앱 알림
--
-- 앱 푸시(notify_user_push)는 이미 나가지만, 벨 아이콘(in_app_notifications)엔
-- 아무것도 안 남아서 알림을 놓치면 "내 예약"을 직접 열어보기 전엔 알 방법이
-- 없었다(2026-09-30). 클라이언트가 자기 자신에게 in_app_notifications를 INSERT할
-- 권한이 없어서(RLS는 SELECT/UPDATE만 허용, 041 마이그레이션 참고) 트리거로 만든다
-- — MD 승인/거절 알림(041), 낙찰 알림(060)과 같은 패턴.
--
-- 접수: korean_booking_requests INSERT 시.
-- 확정: status가 'done'으로 바뀌는 UPDATE 시(= 어드민이 확정서를 처음 저장한 순간,
--   /api/admin/booking이 이미 status를 done으로 바꾸도록 되어 있다 — Migration 없이
--   코드로만 처리됨, 2026-09-30 커밋 2d57faae). 이미 done/cancelled였던 건 건너뛴다.
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_korean_booking_received()
RETURNS TRIGGER AS $$
DECLARE
  v_club_name TEXT;
BEGIN
  SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    NEW.user_id,
    'korean_booking_received',
    '예약 접수됐어요',
    COALESCE(v_club_name, '클럽') || ' ' || to_char(NEW.event_date, 'MM/DD') || ' ' || NEW.group_size || '명 예약 요청을 접수했어요. 파트너 확인 후 알려드릴게요.',
    '/my-bookings'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER korean_booking_received_in_app_trigger
  AFTER INSERT ON korean_booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_korean_booking_received();

CREATE OR REPLACE FUNCTION notify_korean_booking_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  v_club_name TEXT;
  v_ref_no TEXT;
BEGIN
  -- done으로 "새로" 바뀌는 순간에만 — 이미 done/cancelled였으면 재저장(오타 수정)마다
  -- 알림이 또 가면 안 된다.
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;
    SELECT ref_no INTO v_ref_no FROM booking_confirmations
      WHERE request_type = 'korean' AND request_id = NEW.id;

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.user_id,
      'korean_booking_confirmed',
      '예약이 확정됐어요',
      COALESCE(v_club_name, '클럽') || ' ' || to_char(NEW.event_date, 'MM/DD') || ' ' || NEW.group_size || '명 예약이 확정됐어요.' ||
        CASE WHEN v_ref_no IS NOT NULL THEN ' (' || v_ref_no || ')' ELSE '' END,
      '/my-bookings'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER korean_booking_confirmed_in_app_trigger
  AFTER UPDATE OF status ON korean_booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_korean_booking_confirmed();

COMMENT ON FUNCTION notify_korean_booking_received() IS '한국 예약 접수 시 인앱 알림. Migration 679';
COMMENT ON FUNCTION notify_korean_booking_confirmed() IS '한국 예약 확정(status=done) 시 인앱 알림. Migration 679';
