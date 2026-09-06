-- ============================================================================
-- Migration 652: 한국인 클럽 예약 요청 (korean_booking_requests)
--
-- 배경: 외국인 트랙(foreign_requests, Mig 454)과 동일한 컨시어지 모델을
--      한국 유저에게도 제공. 클럽 상세페이지에서 예약하기 → 이 테이블 INSERT
--      → 운영자(admin) 푸시 → admin "한국예약" 탭에서 확인 → 운영자가 클럽 MD에
--      직접 연락(카톡/전화, 수동) → 예약자 연락처로 회신 → Model B(현장 직접결제).
--
-- foreign_requests와 분리하는 이유:
--   - 연락처 채널이 다르다 (전화/인스타그램/오픈채팅 vs whatsapp/wechat/line 등)
--   - 클럽을 한 곳만 지정(상세페이지 단위 예약) — 외국인처럼 최대 3곳 우선순위 아님
--   - 로그인 필수(카카오 인증 유저) — 익명 신청 불허, 24h rate limit도 user_id 기준
-- ============================================================================

CREATE TABLE IF NOT EXISTS korean_booking_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id         UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  event_date      DATE NOT NULL,
  group_size      INTEGER NOT NULL DEFAULT 1,
  selected_menu   JSONB,                              -- SelectedMenuSnapshot (foreign_requests와 동일 구조)
  selected_menu_total INTEGER,
  guest_name      TEXT NOT NULL,                       -- 예약자 이름 (입구 확인용)
  contact_type    TEXT NOT NULL DEFAULT 'phone'
                  CHECK (contact_type IN ('phone', 'instagram', 'openchat')),
  contact_value   TEXT NOT NULL,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'contacted', 'done', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- admin "한국예약" 탭 목록 조회(신규 우선) + 카운트용
CREATE INDEX IF NOT EXISTS idx_korean_booking_requests_status
  ON korean_booking_requests(status, created_at DESC);
-- 유저 본인 요청 조회
CREATE INDEX IF NOT EXISTS idx_korean_booking_requests_user
  ON korean_booking_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_korean_booking_requests_club
  ON korean_booking_requests(club_id);

ALTER TABLE korean_booking_requests ENABLE ROW LEVEL SECURITY;

-- 유저: 본인 요청만 등록
CREATE POLICY "user inserts own korean booking request" ON korean_booking_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 유저: 본인 요청만 조회
CREATE POLICY "user reads own korean booking request" ON korean_booking_requests
  FOR SELECT USING (auth.uid() = user_id);

-- admin: 전체 조회·수정(상태 관리)·삭제
CREATE POLICY "admin manages korean booking requests" ON korean_booking_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER korean_booking_requests_updated_at
  BEFORE UPDATE ON korean_booking_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 스팸 방지 — 같은 유저가 24시간 내 같은 클럽에 중복 신청 차단.
-- 로그인 기반이라 foreign_requests(Mig 489)처럼 연락처가 아니라 user_id+club_id로 판정.
CREATE OR REPLACE FUNCTION check_korean_booking_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM korean_booking_requests
    WHERE user_id = NEW.user_id
      AND club_id = NEW.club_id
      AND created_at > now() - interval '24 hours'
  ) THEN
    RAISE EXCEPTION 'duplicate_korean_booking_within_24h'
      USING HINT = '같은 클럽에 24시간 내 1건만 신청 가능';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS korean_booking_rate_limit ON korean_booking_requests;
CREATE TRIGGER korean_booking_rate_limit
  BEFORE INSERT ON korean_booking_requests
  FOR EACH ROW EXECUTE FUNCTION check_korean_booking_rate_limit();

-- 예약 요청 도착 시 운영팀(admin) 푸시 알림.
-- ⚠️ notify_admins_push(Mig 311/164) — vault에서 인증 읽고, 없으면 조용히 스킵,
--    net.http_post 실패도 호출자에 전파 안 함 → 푸시가 실패해도 INSERT는 절대 롤백 안 됨.
CREATE OR REPLACE FUNCTION notify_admins_korean_booking()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM notify_admins_push(
    '🍾 새 예약 요청',
    NEW.group_size::text || '명 · ' || to_char(NEW.event_date, 'MM/DD'),
    jsonb_build_object('type', 'korean_booking_request', 'id', NEW.id::text, 'url', '/admin/korean-bookings')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS korean_booking_request_notify_admins ON korean_booking_requests;
CREATE TRIGGER korean_booking_request_notify_admins
  AFTER INSERT ON korean_booking_requests
  FOR EACH ROW EXECUTE FUNCTION notify_admins_korean_booking();
