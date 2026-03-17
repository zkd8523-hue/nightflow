-- auctions 테이블에 buy_now_price 컬럼 추가
ALTER TABLE auctions ADD COLUMN buy_now_price INTEGER;

-- BIN 가격 검증 (시작가의 1.5배 이상)
ALTER TABLE auctions ADD CONSTRAINT check_bin_price
  CHECK (buy_now_price IS NULL OR buy_now_price >= start_price * 1.5);

-- ================================
-- 1. place_bid() - 입찰 함수 (재정의)
-- ================================
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id UUID,
  p_bidder_id UUID,
  p_bid_amount INTEGER
) RETURNS JSON AS $$
DECLARE
  v_auction auctions;
  v_effective_end TIMESTAMPTZ;
BEGIN
  -- 1. 행 잠금 (동시성 제어)
  SELECT * INTO v_auction FROM auctions
  WHERE id = p_auction_id FOR UPDATE;

  -- 2. 상태 검증
  IF v_auction.status != 'active' THEN
    RAISE EXCEPTION '경매가 진행 중이 아닙니다';
  END IF;

  -- 3. 종료 시간 확인
  v_effective_end := COALESCE(v_auction.extended_end_at, v_auction.auction_end_at);
  IF now() > v_effective_end THEN
    RAISE EXCEPTION '경매가 종료되었습니다';
  END IF;

  -- 4. 자기 경매 입찰 방지
  IF v_auction.md_id = p_bidder_id THEN
    RAISE EXCEPTION '자신의 경매에 입찰할 수 없습니다';
  END IF;

  -- 5. 차단된 유저 검증
  IF EXISTS (SELECT 1 FROM users WHERE id = p_bidder_id AND is_blocked = true) THEN
    RAISE EXCEPTION '차단된 계정입니다';
  END IF;

  -- 6. 최소 입찰가 검증
  IF v_auction.current_bid = 0 THEN
    IF p_bid_amount < v_auction.start_price THEN
      RAISE EXCEPTION '시작가 이상으로 입찰해주세요';
    END IF;
  ELSE
    IF p_bid_amount < v_auction.current_bid + v_auction.bid_increment THEN
      RAISE EXCEPTION '최소 입찰 단위(1만원) 이상으로 입찰해주세요';
    END IF;
  END IF;

  -- 7. 기존 최고 입찰 outbid 처리
  UPDATE bids SET status = 'outbid'
  WHERE auction_id = p_auction_id AND status = 'active';

  -- 8. 새 입찰 기록
  INSERT INTO bids (auction_id, bidder_id, bid_amount, status)
  VALUES (p_auction_id, p_bidder_id, p_bid_amount, 'active');

  -- 9. 경매 업데이트
  UPDATE auctions SET
    current_bid = p_bid_amount,
    bid_count = bid_count + 1,
    bidder_count = (SELECT COUNT(DISTINCT bidder_id) FROM bids WHERE auction_id = p_auction_id),
    updated_at = now()
  WHERE id = p_auction_id;

  -- 10. 즉시 낙찰(BIN) 검사
  -- buy_now_price가 설정되어 있고, 입찰액이 그 이상인 경우
  IF v_auction.buy_now_price IS NOT NULL AND p_bid_amount >= v_auction.buy_now_price THEN
    -- 방금 넣은 입찰 기록을 즉시 'won' 처리
    UPDATE bids SET status = 'won'
    WHERE auction_id = p_auction_id AND bidder_id = p_bidder_id AND bid_amount = p_bid_amount;

    -- 경매를 즉시 종료(won) 처리
    UPDATE auctions SET
      status = 'won',
      winner_id = p_bidder_id,
      winning_price = p_bid_amount,
      won_at = now(),
      payment_deadline = now() + INTERVAL '15 minutes',
      updated_at = now()
    WHERE id = p_auction_id;

    -- 거래 레코드 생성 (close_auction 패턴과 동일)
    INSERT INTO transactions (
      auction_id, buyer_id, md_id,
      winning_price, total_amount,
      md_commission_rate, md_commission_amt,
      payment_status, reservation_code
    ) VALUES (
      p_auction_id, p_bidder_id, v_auction.md_id,
      p_bid_amount, p_bid_amount,
      10.00, (p_bid_amount * 0.10)::INTEGER,
      'pending',
      'NF-' || upper(substr(md5(random()::text), 1, 4))
    );

    RETURN json_build_object(
      'success', true,
      'bid_amount', p_bid_amount,
      'buy_now', true,
      'result', 'won',
      'new_end_at', now()
    );
  END IF;

  -- 11. 자동 연장 (마감 5분 이내 입찰 시)
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
$$ LANGUAGE plpgsql;
