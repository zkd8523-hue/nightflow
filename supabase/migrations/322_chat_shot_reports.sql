-- Migration 320: 와글 SHOT 신고 (chat_message_reports 패턴)

CREATE TABLE IF NOT EXISTS chat_shot_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id UUID NOT NULL REFERENCES chat_shots(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL
    CHECK (reason IN ('spam', 'abuse', 'sexual', 'advertising', 'fake_location', 'other')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shot_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_shot_reports_pending
  ON chat_shot_reports(status, created_at DESC) WHERE status = 'pending';

ALTER TABLE chat_shot_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Login users can report shots" ON chat_shot_reports;
CREATE POLICY "Login users can report shots"
  ON chat_shot_reports
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = reporter_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM chat_shots
      WHERE id = shot_id AND author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "View own + admin shot reports" ON chat_shot_reports;
CREATE POLICY "View own + admin shot reports"
  ON chat_shot_reports
  FOR SELECT USING (
    auth.uid() = reporter_id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admin can update shot reports" ON chat_shot_reports;
CREATE POLICY "Admin can update shot reports"
  ON chat_shot_reports
  FOR UPDATE USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE chat_shot_reports IS
  '와글 SHOT 신고. status=pending → Admin이 resolved/rejected 처리.';
