-- ============================================================================
-- Migration 274: hotdeal_slot_click_summary 뷰에 unique_users / unique_clickers 추가
--
-- 273에서는 총 클릭 수만 집계. 같은 유저가 N번 누르면 N으로 잡혀 노이즈.
-- admin에서 "총 클릭"과 별개로 "유니크 유저 수"를 함께 보여줘 진짜 관심도를 판단.
--
-- - unique_users: 로그인 유저(user_id NOT NULL) 디스팅트
-- - unique_clickers: 로그인+비로그인 합산 (user_id IS NULL은 슬롯당 1로 카운트)
-- ============================================================================

-- CREATE OR REPLACE VIEW는 컬럼 추가만 허용(기존 순서 변경 불가).
-- 기존 마지막 컬럼이 last_clicked_at이므로, 신규 컬럼은 그 뒤에 추가해야 함.
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
  MAX(k.clicked_at) AS last_clicked_at,
  COUNT(DISTINCT k.user_id) FILTER (WHERE k.user_id IS NOT NULL) AS unique_users,
  (
    COUNT(DISTINCT k.user_id) FILTER (WHERE k.user_id IS NOT NULL)
    + CASE WHEN COUNT(*) FILTER (WHERE k.user_id IS NULL) > 0 THEN 1 ELSE 0 END
  ) AS unique_clickers
FROM weekly_hotdeal_slots s
LEFT JOIN clubs c ON c.id = s.club_id
LEFT JOIN users u ON u.id = s.md_id
LEFT JOIN hotdeal_slot_contact_clicks k ON k.slot_id = s.id
GROUP BY s.id, s.club_id, c.name, c.area, s.md_id, u.name, u.instagram, s.week_start, s.expires_at;

COMMENT ON VIEW hotdeal_slot_click_summary IS
  'Admin용 슬롯별 클릭 집계 + unique_users(로그인 유저 디스팅트)';
