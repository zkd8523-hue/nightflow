-- ============================================================
-- Fix: SECURITY DEFINER 추가 + fallback_to_next_bidder 파라미터 수정
-- ============================================================
-- 문제:
-- 1. Migration 030의 5개 함수 모두 SECURITY DEFINER 누락
--    → Realtime 이벤트 미전달, RLS 우회 불가
-- 2. fallback_to_next_bidder()에서 calculate_contact_timer() 호출 시
--    user_id 미전달 → NightFlow Pass 타이머 연장 미적용
-- ============================================================

-- ================================
-- 1. calculate_contact_timer — SECURITY DEFINER 추가
-- ================================
CREATE OR REPLACE FUNCTION calculate_contact_timer(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  v_dow INTEGER;
  v_hour INTEGER;
  v_base INTEGER;
  v_has_pass BOOLEAN := false;
BEGIN
  v_dow := EXTRACT(DOW FROM now());
  v_hour := EXTRACT(HOUR FROM now());

  IF v_dow IN (5, 6) AND (v_hour >= 22 OR v_hour < 2) THEN
    v_base := 15;
  ELSIF (v_dow = 6 OR v_dow = 0) AND v_hour >= 2 AND v_hour < 4 THEN
    v_base := 20;
  ELSIF (v_dow IN (5, 6) AND v_hour >= 19 AND v_hour < 22) OR v_dow IN (4, 0) THEN
    v_base := 20;
  ELSE
    v_base := 30;
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT (pass_expires_at > now()) INTO v_has_pass FROM users WHERE id = p_user_id;
    IF v_has_pass THEN
      v_base := v_base + 10;
    END IF;
  END IF;

  RETURN v_base;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 2. close_auction — SECURITY DEFINER 추가
-- ================================
CREATE OR REPLACE FUNCTION close_auction(
  p_auction_id UUID
) RETURNS JSON AS $$
DECLARE
  v_auction auctions;
  v_winning_bid bids;
  v_timer INTEGER;
BEGIN
  SELECT * INTO v_auction FROM auctions
  WHERE id = p_auction_id FOR UPDATE;

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

-- ================================
-- 3. place_bid — SECURITY DEFINER 추가
-- ================================
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id UUID,
  p_bidder_id UUID,
  p_bid_amount INTEGER
) RETURNS JSON AS $$
DECLARE
  v_auction auctions;
  v_effective_end TIMESTAMPTZ;
  v_timer INTEGER;
BEGIN
  SELECT * INTO v_auction FROM auctions
  WHERE id = p_auction_id FOR UPDATE;

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

-- ================================
-- 4. apply_noshow_strike — SECURITY DEFINER 추가
-- ================================
CREATE OR REPLACE FUNCTION apply_noshow_strike(
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  v_user users;
  v_new_strike INTEGER;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION '유저를 찾을 수 없습니다';
  END IF;

  IF v_user.strike_waiver_count > 0 AND (v_user.pass_expires_at > now()) THEN
    UPDATE users SET
      strike_waiver_count = strike_waiver_count - 1,
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_user.strike_count,
      'action', 'waived',
      'waiver_used', true,
      'blocked_until', null
    );
  END IF;

  v_new_strike := v_user.strike_count + 1;

  IF v_new_strike >= 3 THEN
    UPDATE users SET
      strike_count = v_new_strike,
      strike_updated_at = now(),
      is_blocked = true,
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'permanent_block',
      'blocked_until', null
    );
  ELSIF v_new_strike = 2 THEN
    UPDATE users SET
      strike_count = v_new_strike,
      strike_updated_at = now(),
      blocked_until = now() + INTERVAL '90 days',
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_90_days',
      'blocked_until', now() + INTERVAL '90 days'
    );
  ELSE
    UPDATE users SET
      strike_count = v_new_strike,
      strike_updated_at = now(),
      blocked_until = now() + INTERVAL '14 days',
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_14_days',
      'blocked_until', now() + INTERVAL '14 days'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 5. fallback_to_next_bidder — SECURITY DEFINER 추가 + 파라미터 수정
-- ================================
CREATE OR REPLACE FUNCTION fallback_to_next_bidder(
  p_auction_id UUID
) RETURNS JSON AS $$
DECLARE
  v_auction auctions;
  v_next_bid bids;
  v_timer INTEGER;
BEGIN
  SELECT * INTO v_auction FROM auctions
  WHERE id = p_auction_id FOR UPDATE;

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
    -- FIX: user_id 전달하여 NightFlow Pass 타이머 연장 적용
    v_timer := calculate_contact_timer(v_next_bid.bidder_id);

    UPDATE bids SET status = 'won' WHERE id = v_next_bid.id;

    UPDATE auctions SET
      winner_id = v_next_bid.bidder_id,
      winning_price = v_next_bid.bid_amount,
      contact_deadline = now() + (v_timer || ' minutes')::INTERVAL,
      contact_timer_minutes = v_timer,
      updated_at = now()
    WHERE id = p_auction_id;

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
