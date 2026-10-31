-- ============================================================================
-- Migration 704: 담당자 제안서 v2 + 손님 자동 흐름 (2026-11-01)
--
-- ① 클럽 자리 목록(clubs.seat_zones) — 담당자는 글로 적지 않고 구역 전체 가능 / 일부 가능에서 고른다.
--    고른 자리는 이름이 정해져 있어 손님 메일 버튼(영어)으로 그대로 바뀐다.
--    형식: [{ "key":"T", "label":"T존", "label_en":"T tables", "space":"EDM존", "seats":["T1",...] }, ...]
-- ② 담당자 응답 확장: md_seats(고른 자리), md_bump_risk(밀릴 수 있음 O/X 필수), md_conditions(이 조건이면 가능해요)
-- ③ 손님 행동 링크(guest_token) + 손님 행동 대기 추적(guest_action_*, guest_alerts) — 메일 미확인 시 운영자 푸시
-- ④ 손님 자리 선택 → 담당자 재확인(md_reconfirm_*)
-- ⑤ 밀림 처리(booking_confirmations.bump_*) + 확인서 변경 이력(booking_confirmation_changes)
--
-- ⚠️ 코드 배포보다 먼저 적용한다 — 제안서·확인서·관리자 화면이 이 컬럼을 select한다.
-- ============================================================================

-- ① 자리 목록 ------------------------------------------------------------------
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS seat_zones JSONB;

UPDATE clubs SET seat_zones = '[
  {"key":"T","label":"T존","label_en":"T tables","space":"EDM존","seats":["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12"]},
  {"key":"C","label":"C존","label_en":"C tables","space":"EDM존","seats":["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10","C11","C12"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":"EDM존","seats":["S1","S2","S3","S4","S5"]},
  {"key":"D","label":"DJ 앞","label_en":"DJ-front tables","space":"EDM존","seats":["D1","D2"]},
  {"key":"R","label":"R존","label_en":"R tables","space":"EDM존","seats":["R1","R2","R3"]},
  {"key":"H","label":"힙합존","label_en":"Hip-hop zone tables","space":"힙합존","seats":["H1","H2","H3","H4","H5","H6","H7","H8","H9","H10","H11","H12","H13","H14","H15","H16"]},
  {"key":"HS","label":"힙합존 스탠딩","label_en":"Hip-hop zone standing","space":"힙합존","seats":["HS1","HS2","HS3","HS4"]}
]'::jsonb WHERE id = '35de296e-5fdc-435b-baf2-1c7c05538687'; -- Club Ace (EDM존 지도 + 힙합존 할로윈 지도, 2026-11-01)

UPDATE clubs SET seat_zones = '[
  {"key":"T","label":"T존","label_en":"T tables","space":null,"seats":["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12"]},
  {"key":"V","label":"V존","label_en":"V tables","space":null,"seats":["V1","V2"]},
  {"key":"D","label":"D존","label_en":"D tables","space":null,"seats":["D1","D2","D3"]},
  {"key":"DS","label":"DJ 옆","label_en":"DJ-side tables","space":null,"seats":["DS1","DS2"]},
  {"key":"S","label":"S존","label_en":"S tables","space":null,"seats":["S1","S2","S3","S4","S5"]}
]'::jsonb WHERE id = 'cc7db051-b75d-4c1f-9f95-29f7d8ce70d7'; -- DM SEOUL (테이블맵 기준, 바 좌석 제외)

-- ②③④ 요청 컬럼 (외국인·한국 공통) --------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['foreign_requests', 'korean_booking_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS md_seats TEXT[]', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS md_bump_risk BOOLEAN', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS md_conditions TEXT', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS guest_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), ''hex'')', t);
    EXECUTE format('UPDATE %I SET guest_token = encode(gen_random_bytes(16), ''hex'') WHERE guest_token IS NULL', t);
    -- 손님에게 행동을 요청한 메일: kind = pick_seat | budget | bump · payload = 버튼에 쓴 자리·금액 등
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS guest_action_kind TEXT', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS guest_action_payload JSONB', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS guest_action_sent_at TIMESTAMPTZ', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS guest_responded_at TIMESTAMPTZ', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS guest_alerts SMALLINT NOT NULL DEFAULT 0', t);
    -- 손님이 고른 자리 + 담당자 재확인(pending | yes | no)
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS guest_choice TEXT', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS md_reconfirm_state TEXT', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS md_reconfirm_at TIMESTAMPTZ', t);
  END LOOP;
END $$;

-- ⑤ 밀림 처리 + 변경 이력 --------------------------------------------------------
ALTER TABLE booking_confirmations
  ADD COLUMN IF NOT EXISTS bump_state TEXT,            -- pending | kept | cancelled | expired
  ADD COLUMN IF NOT EXISTS bump_amount INTEGER,        -- 유지하려면 필요한 총액
  ADD COLUMN IF NOT EXISTS bump_items TEXT,            -- 유지 시 바뀌는 구성(줄바꿈)
  ADD COLUMN IF NOT EXISTS bump_deadline TIMESTAMPTZ,  -- 손님 답 기한
  ADD COLUMN IF NOT EXISTS bump_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_change_note TEXT,      -- 손님 확인서 "Updated" 안내 문장
  ADD COLUMN IF NOT EXISTS last_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS booking_confirmation_changes (
  id BIGSERIAL PRIMARY KEY,
  request_type TEXT NOT NULL,
  request_id UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,          -- admin | bump_kept
  before JSONB,
  after JSONB,
  reason TEXT,
  guest_notified BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_bcc_request ON booking_confirmation_changes (request_type, request_id, changed_at DESC);
ALTER TABLE booking_confirmation_changes ENABLE ROW LEVEL SECURITY; -- service role 전용(정책 없음)
