-- ============================================================================
-- Migration 707: 단톡방 풀 (2026-11-04)
--
-- WhatsApp엔 방을 자동으로 만드는 방법이 없다. 그래서 운영자가 한가할 때 "담당 MD가 이미 들어 있는 빈 방"을
-- 미리 만들어 초대 링크만 이 표에 등록해 두고, 확인서가 나오면 안 쓴 방을 하나 자동으로 배정한다.
-- 배정된 방의 링크는 손님 확정 메일과 손님 확인서(/booking/[token])의 "단톡방 들어가기" 버튼으로 나간다.
--
--  · 한 번 배정된 방은 다시 쓰지 않는다(이전 손님의 대화·번호가 남아 있다) — status = assigned는 되돌리지 않는다.
--  · 예약 하나에 방 하나(request_type, request_id 유일).
--  · service_role 전용(정책 없음) — 관리자 화면은 API 라우트를 거친다. 초대 링크는 아는 사람 누구나 들어올 수 있어 공개 읽기 금지.
--
-- ⚠️ 코드 배포보다 먼저 적용한다 — 확인서 발급(notifyAssignedMd)·손님 확인서 페이지가 이 표를 읽는다.
--    (표가 없어도 코드는 에러만 삼키고 "방 없음"으로 동작하지만, 배정·버튼은 이 표가 있어야 나온다.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_chat_rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 방에 들어 있는 담당 MD
  label         TEXT NOT NULL,                                          -- 운영자가 WhatsApp에서 붙인 방 이름 (예: 우현 방 #3)
  invite_url    TEXT NOT NULL UNIQUE,                                   -- https://chat.whatsapp.com/...
  status        TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'assigned')),
  request_type  TEXT CHECK (request_type IN ('foreign', 'korean')),
  request_id    UUID,
  assigned_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'free' AND request_id IS NULL) OR (status = 'assigned' AND request_id IS NOT NULL))
);

-- 예약 하나에 방 하나
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_chat_rooms_request
  ON group_chat_rooms (request_type, request_id) WHERE request_id IS NOT NULL;
-- 안 쓴 방을 오래된 순으로 꺼낸다
CREATE INDEX IF NOT EXISTS idx_group_chat_rooms_free
  ON group_chat_rooms (md_id, created_at) WHERE status = 'free';

ALTER TABLE group_chat_rooms ENABLE ROW LEVEL SECURITY; -- 정책 없음 = service_role 전용
