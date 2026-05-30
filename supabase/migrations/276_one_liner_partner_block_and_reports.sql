-- Migration 276: 한 줄 리뷰 자정 장치 (멱등성 버전)
-- 1) 한 줄 리뷰 신고 테이블 + admin 검토 워크플로우
--    (파트너 MD 작성 차단 RLS는 277의 헬퍼 함수 버전이 최종 적용본)
--
-- ⚠️ 여러 번 실행해도 안전 (IF NOT EXISTS / DROP IF EXISTS).

-- ============================================
-- 한 줄 리뷰 신고 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS one_liner_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  one_liner_id UUID NOT NULL REFERENCES club_one_liners(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL
    CHECK (reason IN ('spam', 'abuse', 'false_info', 'advertising', 'other')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'rejected')),
  admin_note TEXT,
  action_taken TEXT
    CHECK (action_taken IS NULL OR action_taken IN ('deleted', 'kept', 'warned_user')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (one_liner_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_one_liner_reports_pending
  ON one_liner_reports(status, created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_one_liner_reports_one_liner
  ON one_liner_reports(one_liner_id);
CREATE INDEX IF NOT EXISTS idx_one_liner_reports_club
  ON one_liner_reports(club_id, status);

ALTER TABLE one_liner_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Login users can report one-liner" ON one_liner_reports;
CREATE POLICY "Login users can report one-liner"
  ON one_liner_reports
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND reporter_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM club_one_liners
      WHERE id = one_liner_id
        AND author_id = auth.uid()
    )
  );
-- 차단 유저 제약은 277에서 헬퍼 함수로 덮어씀

DROP POLICY IF EXISTS "View own reports + admin" ON one_liner_reports;
CREATE POLICY "View own reports + admin"
  ON one_liner_reports
  FOR SELECT USING (
    reporter_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admin can update one-liner reports" ON one_liner_reports;
CREATE POLICY "Admin can update one-liner reports"
  ON one_liner_reports
  FOR UPDATE
  USING (public.is_admin());

COMMENT ON TABLE one_liner_reports IS
  '한 줄 리뷰 신고. 본인 글 신고 불가, 중복 신고 불가, admin 검토.';
