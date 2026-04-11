-- 경매 게시글 신고 테이블
CREATE TABLE IF NOT EXISTS auction_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('fake_listing', 'scam_suspect', 'other')),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(auction_id, reporter_id)
);

CREATE INDEX idx_auction_reports_auction ON auction_reports(auction_id);
CREATE INDEX idx_auction_reports_reporter ON auction_reports(reporter_id);

ALTER TABLE auction_reports ENABLE ROW LEVEL SECURITY;

-- 로그인 유저: 본인 신고만 INSERT
CREATE POLICY "Users can report auctions" ON auction_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Admin: 모든 신고 조회
CREATE POLICY "Admins can view all reports" ON auction_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- 유저: 본인이 신고했는지 확인용
CREATE POLICY "Users can check own reports" ON auction_reports
  FOR SELECT USING (auth.uid() = reporter_id);

-- Admin: 신고 삭제(처리 완료) 허용
CREATE POLICY "Admins can delete reports" ON auction_reports
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
