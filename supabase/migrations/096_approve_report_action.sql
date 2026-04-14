-- ============================================================================
-- Migration 096: 신고 승인 시 경매 취소 + MD 경고 증가
--
-- approve_auction_report(report_id):
--   1) auction_reports.status = 'approved' + resolved_at + resolved_by
--   2) auctions.status = 'cancelled'
--   3) users.warning_count +1 (자동 제재 없음, Admin이 수동 판단)
--
-- dismiss_auction_report(report_id):
--   1) auction_reports.status = 'dismissed' + resolved_at + resolved_by
--   (경매/유저 변경 없음)
-- ============================================================================

CREATE OR REPLACE FUNCTION approve_auction_report(p_report_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auction_id UUID;
  v_md_id      UUID;
BEGIN
  -- Admin 권한 확인
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  -- 신고 조회 (pending만 처리)
  SELECT auction_id INTO v_auction_id
  FROM auction_reports
  WHERE id = p_report_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or already processed';
  END IF;

  -- 1. 신고 승인 처리
  UPDATE auction_reports
  SET
    status      = 'approved',
    resolved_at = now(),
    resolved_by = auth.uid()
  WHERE id = p_report_id;

  -- 2. 경매 강제 취소
  UPDATE auctions
  SET status = 'cancelled'
  WHERE id = v_auction_id;

  -- 3. MD warning_count +1 (자동 제재 없음)
  SELECT md_id INTO v_md_id FROM auctions WHERE id = v_auction_id;

  UPDATE users
  SET warning_count = warning_count + 1
  WHERE id = v_md_id;
END;
$$;

CREATE OR REPLACE FUNCTION dismiss_auction_report(p_report_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Admin 권한 확인
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE auction_reports
  SET
    status      = 'dismissed',
    resolved_at = now(),
    resolved_by = auth.uid()
  WHERE id = p_report_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or already processed';
  END IF;
END;
$$;
