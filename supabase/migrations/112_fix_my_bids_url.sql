-- ============================================================================
-- Migration 112: fallback_won/auction_won 알림의 잘못된 URL 수정
-- 날짜: 2026-04-16
-- 설명: /my-bids?tab=ended 라우트가 존재하지 않음 (실제는 /bids?tab=ended)
--       Migration 091 fallback_to_next_bidder() + 094 accept_fallback() 재정의
--       기존 알림도 backfill
-- ============================================================================

-- 1. fallback_to_next_bidder() 재정의 (091 본체 + URL만 /bids로)
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
    '/bids?tab=ended'
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

-- 2. accept_fallback() 재정의 (094 본체 + URL만 /bids로)
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

  IF v_auction.fallback_offered_to IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION '이 경매의 차순위 제안 대상이 아닙니다.';
  END IF;

  IF v_auction.fallback_deadline IS NULL OR v_auction.fallback_deadline < now() THEN
    RAISE EXCEPTION '차순위 수락 시간이 만료되었습니다.';
  END IF;

  v_timer := calculate_contact_timer_for_auction(p_auction_id);

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
    updated_at            = now()
  WHERE id = p_auction_id;

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    p_user_id,
    'auction_won',
    '낙찰 확정!',
    v_auction.club_name || ' 테이블을 ' ||
    (SELECT to_char(bid_amount, 'FM999,999,999') FROM bids WHERE auction_id = p_auction_id AND bidder_id = p_user_id AND status = 'won' LIMIT 1) ||
    '원에 낙찰받았습니다. MD에게 연락하세요!',
    '/bids?tab=ended'
  );

  RETURN json_build_object(
    'success',               true,
    'result',                'accepted',
    'contact_timer_minutes', v_timer
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 기존 알림 backfill: /my-bids → /bids
UPDATE in_app_notifications
SET action_url = REPLACE(action_url, '/my-bids', '/bids')
WHERE action_url LIKE '/my-bids%';
