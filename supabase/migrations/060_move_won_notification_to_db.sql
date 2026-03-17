-- 060: 낙찰 인앱 알림 생성 로직을 DB RPC로 이동
-- Edge Function 의존성을 줄이고 트랜잭션 안전성을 확보합니다.

-- 1. close_auction 수정
CREATE OR REPLACE FUNCTION close_auction(
  p_auction_id UUID
) RETURNS JSON AS $$
DECLARE
  v_auction RECORD;
  v_winning_bid RECORD;
  v_timer INTEGER;
  v_club_name TEXT;
BEGIN
  SELECT a.*, c.name as club_name INTO v_auction 
  FROM auctions a
  JOIN clubs c ON a.club_id = c.id
  WHERE a.id = p_auction_id FOR UPDATE;

  IF v_auction.status != 'active' THEN
    RAISE EXCEPTION '이미 종료된 경매입니다';
  END IF;

  SELECT * INTO v_winning_bid FROM bids
  WHERE auction_id = p_auction_id AND status = 'active'
  ORDER BY bid_amount DESC LIMIT 1;

  IF v_winning_bid IS NULL OR v_winning_bid.bid_amount < v_auction.reserve_price THEN
    UPDATE auctions SET status = 'unsold', updated_at = now()
    WHERE id = p_auction_id;

    RETURN json_build_object('success', true, 'result', 'unsold');
  ELSE
    v_timer := calculate_contact_timer(v_winning_bid.bidder_id);

    UPDATE bids SET status = 'won' WHERE id = v_winning_bid.id;

    UPDATE auctions SET
      status = 'won',
      winner_id = v_winning_bid.bidder_id,
      winning_price = v_winning_bid.bid_amount,
      won_at = now(),
      contact_deadline = now() + (v_timer || ' minutes')::INTERVAL,
      contact_timer_minutes = v_timer,
      updated_at = now()
    WHERE id = p_auction_id;

    -- [추가] 인앱 알림 생성
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_winning_bid.bidder_id,
      'auction_won',
      '낙찰을 축하합니다!',
      v_auction.club_name || ' 테이블을 ' || to_char(v_winning_bid.bid_amount, 'FM999,999,999') || '원에 낙찰받았습니다. MD에게 연락하세요!',
      '/auctions/' || p_auction_id
    );

    RETURN json_build_object(
      'success', true,
      'result', 'won',
      'winner_id', v_winning_bid.bidder_id,
      'winning_price', v_winning_bid.bid_amount,
      'contact_timer_minutes', v_timer
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. place_bid (즉시 낙찰 케이스) 수정
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id UUID,
  p_bidder_id UUID,
  p_bid_amount INTEGER
) RETURNS JSON AS $$
DECLARE
  v_auction RECORD;
  v_effective_end TIMESTAMPTZ;
  v_timer INTEGER;
BEGIN
  SELECT a.*, c.name as club_name INTO v_auction 
  FROM auctions a
  JOIN clubs c ON a.club_id = c.id
  WHERE a.id = p_auction_id FOR UPDATE;

  IF v_auction.status != 'active' THEN
    RAISE EXCEPTION '경매가 진행 중이 아닙니다';
  END IF;

  v_effective_end := COALESCE(v_auction.extended_end_at, v_auction.auction_end_at);
  IF now() > v_effective_end THEN
    RAISE EXCEPTION '경매가 종료되었습니다';
  END IF;

  IF v_auction.md_id = p_bidder_id THEN
    RAISE EXCEPTION '자신의 경매에 입찰할 수 없습니다';
  END IF;

  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = p_bidder_id
    AND (is_blocked = true OR (blocked_until IS NOT NULL AND blocked_until > now()))
  ) THEN
    RAISE EXCEPTION '차단된 계정입니다';
  END IF;

  IF v_auction.current_bid = 0 THEN
    IF p_bid_amount < v_auction.start_price THEN
      RAISE EXCEPTION '시작가 이상으로 입찰해주세요';
    END IF;
  ELSE
    IF p_bid_amount < v_auction.current_bid + v_auction.bid_increment THEN
      RAISE EXCEPTION '최소 입찰 단위(1만원) 이상으로 입찰해주세요';
    END IF;
  END IF;

  UPDATE bids SET status = 'outbid'
  WHERE auction_id = p_auction_id AND status = 'active';

  INSERT INTO bids (auction_id, bidder_id, bid_amount, status)
  VALUES (p_auction_id, p_bidder_id, p_bid_amount, 'active');

  UPDATE auctions SET
    current_bid = p_bid_amount,
    bid_count = bid_count + 1,
    bidder_count = (SELECT COUNT(DISTINCT bidder_id) FROM bids WHERE auction_id = p_auction_id),
    updated_at = now()
  WHERE id = p_auction_id;

  -- 즉시 낙찰 체크
  IF v_auction.buy_now_price IS NOT NULL AND p_bid_amount >= v_auction.buy_now_price THEN
    v_timer := calculate_contact_timer(p_bidder_id);

    UPDATE bids SET status = 'won'
    WHERE auction_id = p_auction_id AND bidder_id = p_bidder_id AND bid_amount = p_bid_amount;

    UPDATE auctions SET
      status = 'won',
      winner_id = p_bidder_id,
      winning_price = p_bid_amount,
      won_at = now(),
      contact_deadline = now() + (v_timer || ' minutes')::INTERVAL,
      contact_timer_minutes = v_timer,
      updated_at = now()
    WHERE id = p_auction_id;

    -- [추가] 인앱 알림 생성
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      p_bidder_id,
      'auction_won',
      '즉시 낙찰 성공!',
      v_auction.club_name || ' 테이블을 ' || to_char(p_bid_amount, 'FM999,999,999') || '원에 즉시 낙찰받았습니다. MD에게 연락하세요!',
      '/auctions/' || p_auction_id
    );

    RETURN json_build_object(
      'success', true,
      'bid_amount', p_bid_amount,
      'buy_now', true,
      'result', 'won',
      'contact_timer_minutes', v_timer,
      'new_end_at', now()
    );
  END IF;

  IF v_effective_end - now() < (v_auction.auto_extend_min || ' minutes')::INTERVAL THEN
    UPDATE auctions SET
      extended_end_at = now() + (v_auction.auto_extend_min || ' minutes')::INTERVAL
    WHERE id = p_auction_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'bid_amount', p_bid_amount,
    'buy_now', false,
    'new_end_at', COALESCE(
      (SELECT extended_end_at FROM auctions WHERE id = p_auction_id),
      v_auction.auction_end_at
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. fallback_to_next_bidder 수정
CREATE OR REPLACE FUNCTION fallback_to_next_bidder(
  p_auction_id UUID
) RETURNS JSON AS $$
DECLARE
  v_auction RECORD;
  v_next_bid RECORD;
  v_timer INTEGER;
BEGIN
  SELECT a.*, c.name as club_name INTO v_auction 
  FROM auctions a
  JOIN clubs c ON a.club_id = c.id
  WHERE a.id = p_auction_id FOR UPDATE;

  IF v_auction.status != 'won' THEN
    RAISE EXCEPTION '낙찰 상태가 아닌 경매입니다';
  END IF;

  UPDATE bids SET status = 'cancelled'
  WHERE auction_id = p_auction_id AND status = 'won';

  SELECT * INTO v_next_bid FROM bids
  WHERE auction_id = p_auction_id
    AND status = 'outbid'
    AND bidder_id != v_auction.winner_id
  ORDER BY bid_amount DESC LIMIT 1;

  IF v_next_bid IS NULL OR v_next_bid.bid_amount < v_auction.reserve_price THEN
    UPDATE auctions SET
      status = 'unsold',
      winner_id = NULL,
      winning_price = NULL,
      contact_deadline = NULL,
      updated_at = now()
    WHERE id = p_auction_id;

    RETURN json_build_object('success', true, 'result', 'unsold', 'reason', 'no_next_bidder');
  ELSE
    v_timer := calculate_contact_timer(v_next_bid.bidder_id);

    UPDATE bids SET status = 'won' WHERE id = v_next_bid.id;

    UPDATE auctions SET
      winner_id = v_next_bid.bidder_id,
      winning_price = v_next_bid.bid_amount,
      contact_deadline = now() + (v_timer || ' minutes')::INTERVAL,
      contact_timer_minutes = v_timer,
      updated_at = now()
    WHERE id = p_auction_id;

    -- [추가] 인앱 알림 생성
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_next_bid.bidder_id,
      'auction_won',
      '차순위 낙찰 안내',
      v_auction.club_name || ' 테이블의 차순위 낙찰자가 되셨습니다. ' || to_char(v_next_bid.bid_amount, 'FM999,999,999') || '원에 낙찰되었습니다. MD에게 연락하세요!',
      '/auctions/' || p_auction_id
    );

    RETURN json_build_object(
      'success', true,
      'result', 'fallback_won',
      'winner_id', v_next_bid.bidder_id,
      'winning_price', v_next_bid.bid_amount,
      'contact_timer_minutes', v_timer
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
