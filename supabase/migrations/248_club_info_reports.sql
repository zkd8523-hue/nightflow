-- 248: 클럽 정보 오류 신고
-- 유저/MD 누구나 클럽 상세에서 "틀린 정보가 있어요" 신고 가능
-- admin이 검토 후 직접 수정 → 신고 close

CREATE TABLE IF NOT EXISTS club_info_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 비로그인도 허용? 일단 NULL 가능
  category TEXT, -- 'operating_hours' | 'tags' | 'address' | 'dresscode' | 'other' (자유)
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_info_reports_club_status
  ON club_info_reports(club_id, status);
CREATE INDEX IF NOT EXISTS idx_club_info_reports_pending
  ON club_info_reports(status) WHERE status = 'pending';

ALTER TABLE club_info_reports ENABLE ROW LEVEL SECURITY;

-- INSERT: 로그인 한 사용자 누구나 (본인 ID 또는 NULL)
DROP POLICY IF EXISTS "Anyone authed can report" ON club_info_reports;
CREATE POLICY "Anyone authed can report" ON club_info_reports
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (reporter_id IS NULL OR reporter_id = auth.uid()));

-- SELECT: 본인 신고 + admin 전체 + 해당 클럽 파트너 MD (현장 인지 위해)
DROP POLICY IF EXISTS "View own + admin + partner" ON club_info_reports;
CREATE POLICY "View own + admin + partner" ON club_info_reports
  FOR SELECT USING (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM club_partners WHERE club_id = club_info_reports.club_id AND md_id = auth.uid())
  );

-- UPDATE: admin만 (서비스 키로 갱신해도 OK)
DROP POLICY IF EXISTS "Admin can update reports" ON club_info_reports;
CREATE POLICY "Admin can update reports" ON club_info_reports
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE club_info_reports IS
  '클럽 정보 오류 신고. 유저/MD 누구나 신고, admin 검토 후 처리.';
