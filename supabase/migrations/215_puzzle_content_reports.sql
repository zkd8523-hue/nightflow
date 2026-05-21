-- 깃발(puzzle) 일반 유저 신고 테이블 (Apple Guideline 1.2)
--
-- 기존 puzzle_reports는 MD 사기 신고 전용 (크레딧 결제 후 허위매물 신고).
-- 본 테이블은 일반 유저가 깃발 콘텐츠를 신고할 수 있도록 별도 분리.

CREATE TABLE IF NOT EXISTS puzzle_content_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id    UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL CHECK (reason IN (
    'inappropriate_content',
    'scam_suspect',
    'harassment',
    'spam',
    'fake_listing',
    'other'
  )),
  memo         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'dismissed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  UNIQUE(puzzle_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_puzzle_content_reports_status_created
  ON puzzle_content_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_puzzle_content_reports_puzzle
  ON puzzle_content_reports(puzzle_id);

ALTER TABLE puzzle_content_reports ENABLE ROW LEVEL SECURITY;

-- 로그인 유저는 신고 가능 (자기 자신 깃발 제외)
CREATE POLICY "Users can report puzzles" ON puzzle_content_reports
  FOR INSERT WITH CHECK (
    auth.uid() = reporter_id
    AND NOT EXISTS (
      SELECT 1 FROM puzzles
      WHERE id = puzzle_content_reports.puzzle_id
        AND leader_id = auth.uid()
    )
  );

-- 본인 신고 이력 확인 (중복 신고 방지)
CREATE POLICY "Users can read own reports" ON puzzle_content_reports
  FOR SELECT USING (auth.uid() = reporter_id);

-- Admin 전체 조회/처리
CREATE POLICY "Admins can view all puzzle reports" ON puzzle_content_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update puzzle reports" ON puzzle_content_reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
