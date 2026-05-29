-- 게스트 간판(weekly_hotdeal_slots) 연락처 클릭 추적
-- 클럽 상세의 게스트 간판 박스에서 인스타/오픈채팅/문의 메시지 복사 버튼이 눌린 횟수
-- 집계 단위: slot_id (= 클럽 × 주차 × 담당 MD)

CREATE TABLE IF NOT EXISTS hotdeal_slot_contact_clicks (
  id BIGSERIAL PRIMARY KEY,
  slot_id UUID NOT NULL REFERENCES weekly_hotdeal_slots(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  md_id UUID REFERENCES users(id) ON DELETE SET NULL,
  week_start DATE NOT NULL,
  click_type TEXT NOT NULL CHECK (click_type IN ('instagram', 'openchat', 'copy_message')),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotdeal_clicks_slot ON hotdeal_slot_contact_clicks(slot_id);
CREATE INDEX IF NOT EXISTS idx_hotdeal_clicks_club_week ON hotdeal_slot_contact_clicks(club_id, week_start);
CREATE INDEX IF NOT EXISTS idx_hotdeal_clicks_md_week ON hotdeal_slot_contact_clicks(md_id, week_start);
CREATE INDEX IF NOT EXISTS idx_hotdeal_clicks_at ON hotdeal_slot_contact_clicks(clicked_at DESC);

ALTER TABLE hotdeal_slot_contact_clicks ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 INSERT 가능 (익명 포함 — 게스트 간판은 비로그인 노출 가능)
DROP POLICY IF EXISTS "Anyone can insert hotdeal click" ON hotdeal_slot_contact_clicks;
CREATE POLICY "Anyone can insert hotdeal click" ON hotdeal_slot_contact_clicks
  FOR INSERT WITH CHECK (true);

-- 관리자만 조회
DROP POLICY IF EXISTS "Admin can read hotdeal clicks" ON hotdeal_slot_contact_clicks;
CREATE POLICY "Admin can read hotdeal clicks" ON hotdeal_slot_contact_clicks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- 집계 뷰: 슬롯별 × 클릭 타입별 카운트 (admin 페이지에서 사용)
CREATE OR REPLACE VIEW hotdeal_slot_click_summary AS
SELECT
  s.id AS slot_id,
  s.club_id,
  c.name AS club_name,
  c.area AS club_area,
  s.md_id,
  u.name AS md_name,
  u.instagram AS md_instagram,
  s.week_start,
  s.expires_at,
  COUNT(*) FILTER (WHERE k.click_type = 'instagram') AS instagram_clicks,
  COUNT(*) FILTER (WHERE k.click_type = 'openchat') AS openchat_clicks,
  COUNT(*) FILTER (WHERE k.click_type = 'copy_message') AS copy_message_clicks,
  COUNT(*) AS total_clicks,
  MAX(k.clicked_at) AS last_clicked_at
FROM weekly_hotdeal_slots s
LEFT JOIN clubs c ON c.id = s.club_id
LEFT JOIN users u ON u.id = s.md_id
LEFT JOIN hotdeal_slot_contact_clicks k ON k.slot_id = s.id
GROUP BY s.id, s.club_id, c.name, c.area, s.md_id, u.name, u.instagram, s.week_start, s.expires_at;

COMMENT ON TABLE hotdeal_slot_contact_clicks IS '게스트 간판 상세에서 인스타/오픈채팅/메시지복사 버튼 클릭 로그';
COMMENT ON VIEW hotdeal_slot_click_summary IS 'Admin용 슬롯별 클릭 집계';
