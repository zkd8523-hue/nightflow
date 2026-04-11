-- ============================================================================
-- Migration 091: 차순위 수락 제한시간 1시간 → 15분 단축
--
-- 배경:
--   빠른 순환으로 MD 테이블을 채우는 것이 우선. 1시간은 너무 길다.
--   15분이면 알림톡(FALLBACK_WON) 수신 → 앱 열기 → 수락 충분.
--
-- 변경:
--   fallback_to_next_bidder(): INTERVAL '1 hour' → INTERVAL '15 minutes'
--   인앱 알림 메시지: "1시간" → "15분"
-- ============================================================================

CREATE OR REPLACE FUNCTION fallback_to_next_bidder(
  p_auction_id UUID
) RETURNS JSON AS $$
DECLARE
  v_auction  RECORD;
  v_next_bid RECORD;
  v_excluded_ids UUID[];
BEGIN
  SELECT a.*, c.name as club_name INTO v_auction
  FROM auctions a
  JOIN clubs c ON a.club_id = c.id
  WHERE a.id = p_auction_id FOR UPDATE;

  IF v_auction.status != 'won' THEN
    RAISE EXCEPTION '낙찰 상태가 아닌 경매입니다 (status=%). 차순위 제안 불가.', v_auction.status;
  END IF;

  v_excluded_ids := ARRAY[v_auction.winner_id];
  IF v_auction.fallback_offered_to IS NOT NULL THEN
    v_excluded_ids := v_excluded_ids || ARRAY[v_auction.fallback_offered_to];
  END IF;

  UPDATE bids SET status = 'cancelled'
  WHERE auction_id = p_auction_id
    AND status = 'won';

  SELECT * INTO v_next_bid FROM bids
  WHERE auction_id = p_auction_id
    AND status = 'outbid'
    AND bidder_id != ALL(v_excluded_ids)
  ORDER BY bid_amount DESC LIMIT 1;

  IF v_next_bid IS NULL OR v_next_bid.bid_amount < v_auction.reserve_price THEN
    UPDATE auctions SET
      status            = 'unsold',
      winner_id         = NULL,
      winning_price     = NULL,
      contact_deadline  = NULL,
      fallback_offered_to   = NULL,
      fallback_offered_at   = NULL,
      fallback_deadline     = NULL,
      updated_at        = now()
    WHERE id = p_auction_id;

    RETURN json_build_object(
      'success', true,
      'result',  'unsold',
      'reason',  'no_next_bidder'
    );
  END IF;

  -- 차순위에게 15분 opt-in 제안 (088: 1시간 → 091: 15분)
  UPDATE auctions SET
    winner_id             = NULL,
    winning_price         = NULL,
    contact_deadline      = NULL,
    contact_timer_minutes = NULL,
    fallback_offered_to   = v_next_bid.bidder_id,
    fallback_offered_at   = now(),
    fallback_deadline     = now() + INTERVAL '15 minutes',
    updated_at            = now()
  WHERE id = p_auction_id;

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_next_bid.bidder_id,
    'fallback_won',
    '차순위 낙찰 제안이 도착했습니다!',
    v_auction.club_name || ' 테이블 ' || to_char(v_next_bid.bid_amount, 'FM999,999,999') ||
    '원 낙찰 기회입니다. 15분 안에 수락하세요!',
    '/my-bids?tab=ended'
  );

  RETURN json_build_object(
    'success',           true,
    'result',            'fallback_offered',
    'offered_to',        v_next_bid.bidder_id,
    'offered_bid_amount', v_next_bid.bid_amount,
    'fallback_deadline', (now() + INTERVAL '15 minutes')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fallback_to_next_bidder(UUID) IS
  'Migration 091: opt-in 15분 수락 제안 (088의 1시간에서 단축).';
