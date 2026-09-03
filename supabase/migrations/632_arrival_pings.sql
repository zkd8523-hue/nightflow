-- ============================================================================
-- Migration 632: 도착 알림 (arrival_pings) + 예약 담당 MD
--
-- 배경: 외국인 손님이 클럽 앞에 도착해도 MD가 모른다. 앱이 있으면 푸시로
--      "도착 5분 전"을 보내 마중 나가게 하려 했으나 한국 앱스토어 심사가
--      안 끝나 앱 배포가 막혀 있다.
--
-- 대안: 확인표는 이미 웹 링크(WhatsApp으로 발송)라 앱 없이 버튼만 누르면
--      된다. 누르면 운영자와 담당 MD 양쪽에 SMS가 나간다.
--      SMS는 알림톡과 달리 템플릿 사전승인이 필요 없어 즉시 쓸 수 있다.
--
-- 참조: 454_foreign_requests.sql, src/lib/notifications/alimtalk.ts(sendSms)
-- ============================================================================

-- 1) 예약 담당 MD — 파트너가 여러 명인 클럽(Club Ace 10명)에서 누구에게
--    보낼지 특정할 방법이 없었다.
ALTER TABLE foreign_requests
  ADD COLUMN IF NOT EXISTS assigned_md_id UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN foreign_requests.assigned_md_id IS
  '이 예약의 담당 MD. 도착 알림 SMS 수신자. NULL이면 운영자에게만 발송된다.';

CREATE INDEX IF NOT EXISTS idx_foreign_requests_assigned_md
  ON foreign_requests(assigned_md_id) WHERE assigned_md_id IS NOT NULL;

-- 2) 도착 신호 로그
CREATE TABLE IF NOT EXISTS arrival_pings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES foreign_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('soon', 'arrived')),  -- soon=10분 전
  notified_admin BOOLEAN NOT NULL DEFAULT FALSE,
  notified_md BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,                                -- 발송 실패 사유 등
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 손님이 여러 번 눌러도 같은 종류는 1회만. 재발송은 취소 후 다시 누르는 게 아니라
  -- 운영자가 직접 연락하는 게 맞다(문자 폭탄 방지).
  UNIQUE (request_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_arrival_pings_request
  ON arrival_pings(request_id, created_at DESC);

COMMENT ON TABLE arrival_pings IS
  '손님이 확인표에서 누른 도착 신호. UNIQUE(request_id, kind)로 중복 발송을 막는다.';

ALTER TABLE arrival_pings ENABLE ROW LEVEL SECURITY;

-- 손님은 비로그인(익명)으로 확인표를 여는 경우가 많아 클라이언트 직접 INSERT를
-- 허용하지 않는다. 서버 라우트(service role)만 기록한다.
CREATE POLICY "admin reads arrival pings" ON arrival_pings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
