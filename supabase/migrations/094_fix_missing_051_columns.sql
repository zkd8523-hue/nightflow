-- ============================================================================
-- Migration 094: Migration 051 누락 컬럼 복구 + accept_fallback 수정
--
-- 문제:
--   Migration 051에서 추가한 is_bin_win, fallback_from_winner_id 컬럼이
--   리모트 DB에 미적용. accept_fallback() 함수가 fallback_from_winner_id를
--   참조하여 차순위 수락 시 42703 에러 발생.
--
-- 수정:
--   1) 누락 컬럼 2개 복구 (IF NOT EXISTS로 안전)
--   2) accept_fallback() 재정의 — v_auction record 대신 직접 컬럼 참조
-- ============================================================================

-- 1. 누락 컬럼 복구
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS is_bin_win BOOLEAN DEFAULT false;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS fallback_from_winner_id UUID REFERENCES users(id);

-- 2. accept_fallback() 재정의
--    변경점: fallback_from_winner_id 보존 로직을 서브쿼리 제거 → UPDATE에서 컬럼 미언급 시 기존값 유지
CREATE OR REPLACE FUNCTION accept_fallback(
  p_auction_id UUID,
  p_user_id    UUID
) RETURNS JSON AS $$
DECLARE
  v_auction RECORD;
  v_timer   INTEGER;
BEGIN
  SELECT a.*, c.name as club_name INTO v_auction
  FROM auctions a
  JOIN clubs c ON a.club_id = c.id
  WHERE a.id = p_auction_id FOR UPDATE;

  -- 검증: 제안 상태 확인
  IF v_auction.fallback_offered_to IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION '이 경매의 차순위 제안 대상이 아닙니다.';
  END IF;

  IF v_auction.fallback_deadline IS NULL OR v_auction.fallback_deadline < now() THEN
    RAISE EXCEPTION '차순위 수락 시간이 만료되었습니다.';
  END IF;

  -- 동적 contact_deadline 산출
  v_timer := calculate_contact_timer_for_auction(p_auction_id);

  -- 낙찰 처리
  UPDATE bids SET status = 'won'
  WHERE auction_id = p_auction_id
    AND bidder_id  = p_user_id
    AND status     = 'outbid';

  UPDATE auctions SET
    status                = 'won',
    winner_id             = p_user_id,
    winning_price         = (
      SELECT bid_amount FROM bids
      WHERE auction_id = p_auction_id AND bidder_id = p_user_id AND status = 'won'
      ORDER BY bid_amount DESC LIMIT 1
    ),
    won_at                = now(),
    contact_deadline      = CASE
      WHEN v_timer IS NULL THEN NULL
      ELSE now() + (v_timer || ' minutes')::INTERVAL
    END,
    contact_timer_minutes = v_timer,
    fallback_offered_to   = NULL,
    fallback_offered_at   = NULL,
    fallback_deadline     = NULL,
    -- fallback_from_winner_id: UPDATE에서 미언급 → 기존값 자동 유지
    updated_at            = now()
  WHERE id = p_auction_id;

  -- 인앱 알림: 낙찰 확정
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    p_user_id,
    'auction_won',
    '낙찰 확정!',
    v_auction.club_name || ' 테이블을 ' ||
    (SELECT to_char(bid_amount, 'FM999,999,999') FROM bids WHERE auction_id = p_auction_id AND bidder_id = p_user_id AND status = 'won' LIMIT 1) ||
    '원에 낙찰받았습니다. MD에게 연락하세요!',
    '/my-bids?tab=ended'
  );

  RETURN json_build_object(
    'success',               true,
    'result',                'accepted',
    'contact_timer_minutes', v_timer
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION accept_fallback(UUID, UUID) IS
  'Migration 094: fallback_from_winner_id record 참조 에러 수정. 컬럼 미언급으로 기존값 자동 보존.';
