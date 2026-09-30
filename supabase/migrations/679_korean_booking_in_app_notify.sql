-- ============================================================================
-- Migration 679: 한국 예약 접수/확정 인앱 알림 + MD 제안서/확정서 알림 타입 추가
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
--
-- ⚠️ 첫 적용 시도에서 두 가지를 놓쳤었다(2026-09-30, 그 사이 예약 신청이 막힘):
--   1) in_app_notifications.type CHECK 제약(551 마이그레이션)에 새 타입을 안 넣어서
--      INSERT 자체가 위반으로 실패.
--   2) 트리거 함수에 EXCEPTION 처리가 없어서, 그 INSERT 실패가 트리거를 호출한
--      korean_booking_requests INSERT/UPDATE까지 통째로 롤백시킴 — 손님이 예약을
--      아예 못 내는 사고. coupon_favorite_notify(551)가 이미 겪은 실수라 그 패턴
--      (EXCEPTION WHEN OTHERS로 알림 실패를 격리)을 그대로 따른다.
-- ============================================================================

-- 1) 알림 type 허용 목록에 두 개 추가 — CHECK는 부분 수정이 불가능해 551의
--    목록 전체를 그대로 승계하고 두 줄만 늘린다.
ALTER TABLE in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

ALTER TABLE in_app_notifications
  ADD CONSTRAINT in_app_notifications_type_check CHECK (type IN (
    'md_approved', 'md_rejected', 'outbid', 'auction_won',
    'contact_deadline_warning', 'noshow_penalty', 'fallback_won',
    'feedback_request', 'md_grade_change', 'cancellation_confirmed',
    'contact_expired_no_fault', 'contact_expired_user_attempted',
    'md_winner_cancelled', 'md_winner_noshow', 'md_new_bid',
    'md_noshow_review', 'noshow_dismissed',
    'puzzle_seat_adjusted', 'puzzle_cancelled',
    'puzzle_offer_received', 'puzzle_offer_accepted', 'puzzle_offer_rejected',
    'puzzle_leader_changed', 'puzzle_member_joined',
    'puzzle_visit_pending', 'puzzle_visit_confirmed',
    'puzzle_promoted_to_flag',
    'offer_withdrawn_by_admin',
    'admin_puzzle_expired', 'admin_puzzle_cancelled',
    'admin_match_expired', 'admin_match_cancelled',
    'chat_reply',
    'party_md_invited', 'party_removed', 'party_md_released',
    'dm_request', 'dm_accepted',
    'credit_charged',
    'admin_visit_review_pending', 'admin_review_delete_request',
    'coupon_revoked',
    'coupon_new_from_favorite',
    -- 신규 (679): 한국 예약 접수/확정
    'korean_booking_received', 'korean_booking_confirmed',
    -- 신규: 담당 MD에게 제안서/확정서 도착 알림(notifyAssignedMd, notify-md 라우트)
    'md_new_booking_proposal', 'md_booking_confirmed'
  ));

-- 1-1) 위 CHECK와 별개로: "확정서 보내기" 버튼이 MD·손님에게 벨 알림도 함께
--      남기도록(src/lib/booking/notifyMd.ts) 새 타입 두 개를 허용 목록에 포함했다.
--      (md_new_booking_proposal, md_booking_confirmed — 위 CHECK 블록에 이미 추가됨)

-- 2) 접수 트리거
CREATE OR REPLACE FUNCTION notify_korean_booking_received()
RETURNS TRIGGER AS $$
DECLARE
  v_club_name TEXT;
BEGIN
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
  -- 알림 실패가 예약 신청 자체를 막으면 안 된다 — INSERT는 이미 성공한 뒤라
  -- 여기서 막히면 손님은 예약이 실패한 줄 알고 다시 시도하다 중복 신청이 된다.
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_korean_booking_received: failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS korean_booking_received_in_app_trigger ON korean_booking_requests;
CREATE TRIGGER korean_booking_received_in_app_trigger
  AFTER INSERT ON korean_booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_korean_booking_received();

-- 3) 확정 트리거
CREATE OR REPLACE FUNCTION notify_korean_booking_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  v_club_name TEXT;
  v_ref_no TEXT;
BEGIN
  -- done으로 "새로" 바뀌는 순간에만 — 이미 done/cancelled였으면 재저장(오타 수정)마다
  -- 알림이 또 가면 안 된다.
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    BEGIN
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
    -- 알림 실패가 확정서 저장(status=done UPDATE) 자체를 막으면 안 된다.
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'notify_korean_booking_confirmed: failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS korean_booking_confirmed_in_app_trigger ON korean_booking_requests;
CREATE TRIGGER korean_booking_confirmed_in_app_trigger
  AFTER UPDATE OF status ON korean_booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_korean_booking_confirmed();

COMMENT ON FUNCTION notify_korean_booking_received() IS '한국 예약 접수 시 인앱 알림(알림 실패해도 예약은 유지). Migration 679';
COMMENT ON FUNCTION notify_korean_booking_confirmed() IS '한국 예약 확정(status=done) 시 인앱 알림(알림 실패해도 확정은 유지). Migration 679';
