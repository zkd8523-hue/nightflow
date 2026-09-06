-- ============================================================================
-- Migration 653: 한국인 예약 요청 — 본인 수정/취소 허용 + 확인 후 수정 시 운영자 알림
--
-- 정책 (사용자 확정, 2026-09-06):
--   - 취소: status와 무관하게 예약자 본인이 언제든 가능.
--   - 수정(status='new', 운영자 미확인): 자유롭게, 알림 없음.
--   - 수정(status='contacted' 이후, 운영자 확인함): 가능하지만 운영자에게 푸시
--     알림 발송 — 이미 MD와 조율 중일 수 있어 재확인이 필요하기 때문.
--   - "운영자가 확인했다"의 기준: 관리자 화면에서 연락처 복사 버튼을 누르는 순간
--     (KoreanBookingsClient.tsx) — new → contacted 전환.
--
-- foreign_requests에는 본인 수정/취소 정책이 없다(운영자 전담) — 한국 트랙만
-- 로그인 필수라 본인 확인이 가능해서 이 기능을 추가한다.
--
-- ⚠️ RLS WITH CHECK에서 같은 테이블을 서브쿼리해 OLD 값을 보려는 시도는 하지
-- 않는다 — PostgreSQL이 이미 적용된 NEW 상태를 볼 수 있어 신뢰할 수 없다.
-- 대신 상태 전환 규칙은 BEFORE UPDATE 트리거에서 OLD/NEW를 직접 비교해 강제한다.
-- ============================================================================

-- 유저: 본인 요청 수정(필드 자유 변경 + 취소). 어떤 상태 전환이 허용되는지는
-- 아래 enforce_korean_booking_user_transition() 트리거가 판정한다.
CREATE POLICY "user updates own korean booking request" ON korean_booking_requests
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 유저가 직접 status를 'contacted'/'done'/'new'로 셀프 승격하지 못하게 막는다.
-- 허용: status 유지(필드만 수정) 또는 'cancelled'로 전환.
-- admin 정책(FOR ALL)으로 들어오는 UPDATE는 auth.uid()가 admin 본인이라
-- OLD.user_id와 달라 이 트리거의 WHEN 조건에 걸리지 않는다.
CREATE OR REPLACE FUNCTION enforce_korean_booking_user_transition()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> OLD.status AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'korean_booking_status_transition_not_allowed'
      USING HINT = '예약자는 취소로만 상태를 바꿀 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS korean_booking_enforce_user_transition ON korean_booking_requests;
CREATE TRIGGER korean_booking_enforce_user_transition
  BEFORE UPDATE ON korean_booking_requests
  FOR EACH ROW
  WHEN (auth.uid() = OLD.user_id)  -- 유저 본인 수정일 때만 검증. admin은 예외.
  EXECUTE FUNCTION enforce_korean_booking_user_transition();

-- status가 'new'를 벗어난(운영자가 이미 확인한) 예약을 유저가 수정하면 운영자에게 알림.
-- 취소(cancelled로 전환)는 "예약이 없어진 것"이라 재조율 알림이 필요 없어 제외.
CREATE OR REPLACE FUNCTION notify_admins_korean_booking_edited()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'new' AND NEW.status = OLD.status THEN
    PERFORM notify_admins_push(
      '✏️ 예약 정보 변경됨',
      NEW.group_size::text || '명 · ' || to_char(NEW.event_date, 'MM/DD') || ' — 재확인 필요',
      jsonb_build_object('type', 'korean_booking_edited', 'id', NEW.id::text, 'url', '/admin/korean-bookings')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS korean_booking_request_notify_edit ON korean_booking_requests;
CREATE TRIGGER korean_booking_request_notify_edit
  AFTER UPDATE ON korean_booking_requests
  FOR EACH ROW
  WHEN (auth.uid() = OLD.user_id)  -- 유저 본인 수정일 때만 (admin의 상태 변경은 제외)
  EXECUTE FUNCTION notify_admins_korean_booking_edited();
