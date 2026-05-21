-- Migration 212: 클럽 요청 리드 수집
--
-- 배경:
--   조각 리스트가 비어있거나 필터 결과가 없을 때 유저에게
--   "원하는 클럽이 없나요? 요청해보세요" CTA를 노출하고,
--   클럽명을 수집해 영업 타겟 리드로 활용.
--
-- 보안:
--   누구나 INSERT 가능 (비로그인 포함). 조회는 admin만.

CREATE TABLE IF NOT EXISTS club_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  club_name   TEXT NOT NULL CHECK (char_length(club_name) BETWEEN 1 AND 60),
  area        TEXT,
  note        TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_requests_created_at ON club_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_requests_club_name ON club_requests(lower(club_name));

ALTER TABLE club_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit club requests" ON club_requests;
CREATE POLICY "Anyone can submit club requests" ON club_requests
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read club requests" ON club_requests;
CREATE POLICY "Admins can read club requests" ON club_requests
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
