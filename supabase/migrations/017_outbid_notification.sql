-- ============================================
-- Outbid 알림 지원: place_bid()에 previous_bidder_id 반환
-- + notification_logs event_type에 'outbid' 추가
-- ============================================

-- 1. notification_logs event_type에 'outbid' 추가
ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_event_type_check;
ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_event_type_check
  CHECK (event_type IN ('auction_started','auction_won','payment_completed','visit_confirmed','outbid'));

-- 2. place_bid() 재정의: previous_bidder_id를 JSON 결과에 포함
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id UUID,
  p_bidder_id UUID,
  p_bid_amount INTEGER
) RETURNS JSON AS $$
DECLARE
  v_auction auctions;
  v_effective_end TIMESTAMPTZ;
  v_prev_bidder_id UUID;
BEGIN
  -- 1. 행 잠금 (동시성 제어)
  SELECT * INTO v_auction FROM auctions
  WHERE id = p_auction_id FOR UPDATE;

  -- NULL 체크 (경매 미존재)
  IF v_auction IS NULL THEN
    RAISE EXCEPTION '경매를 찾을 수 없습니다';
  END IF;

  -- 2. scheduled 경매 자동 활성화: 시작 시간이 지났으면 active로 전환
  IF v_auction.status = 'scheduled' AND now() >= v_auction.auction_start_at THEN
    UPDATE auctions SET status = 'active', updated_at = now()
    WHERE id = p_auction_id;
    v_auction.status := 'active';
  END IF;

  -- 3. 상태 검증
  IF v_auction.status != 'active' THEN
    RAISE EXCEPTION '경매가 진행 중이 아닙니다 (현재: %)', v_auction.status;
  END IF;

  -- 4. 종료 시간 확인
  v_effective_end := COALESCE(v_auction.extended_end_at, v_auction.auction_end_at);
  IF now() > v_effective_end THEN
    RAISE EXCEPTION '경매가 종료되었습니다';
  END IF;

  -- 5. 자기 경매 입찰 방지
  IF v_auction.md_id = p_bidder_id THEN
    RAISE EXCEPTION '자신의 경매에 입찰할 수 없습니다';
  END IF;

  -- 6. 차단된 유저 검증
  IF EXISTS (SELECT 1 FROM users WHERE id = p_bidder_id AND is_blocked = true) THEN
    RAISE EXCEPTION '차단된 계정입니다';
  END IF;

  -- 7. ★ 연속 입찰 방지: 이미 최고 입찰자인 경우 거부
  IF EXISTS (
    SELECT 1 FROM bids
    WHERE auction_id = p_auction_id
      AND bidder_id = p_bidder_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION '이미 최고 입찰자입니다';
  END IF;

  -- 8. 최소 입찰가 검증
  IF v_auction.current_bid = 0 THEN
    IF p_bid_amount < v_auction.start_price THEN
      RAISE EXCEPTION '시작가 이상으로 입찰해주세요';
    END IF;
  ELSE
    IF p_bid_amount < v_auction.current_bid + v_auction.bid_increment THEN
      RAISE EXCEPTION '최소 입찰 단위(1만원) 이상으로 입찰해주세요';
    END IF;
  END IF;

  -- 9. ★ 이전 최고 입찰자 ID 저장 (outbid 알림용)
  SELECT bidder_id INTO v_prev_bidder_id FROM bids
  WHERE auction_id = p_auction_id AND status = 'active'
  LIMIT 1;

  -- 10. 기존 최고 입찰 outbid 처리
  UPDATE bids SET status = 'outbid'
  WHERE auction_id = p_auction_id AND status = 'active';

  -- 11. 새 입찰 기록
  INSERT INTO bids (auction_id, bidder_id, bid_amount, status)
  VALUES (p_auction_id, p_bidder_id, p_bid_amount, 'active');

  -- 12. 경매 업데이트
  UPDATE auctions SET
    current_bid = p_bid_amount,
    bid_count = bid_count + 1,
    bidder_count = (SELECT COUNT(DISTINCT bidder_id) FROM bids WHERE auction_id = p_auction_id),
    updated_at = now()
  WHERE id = p_auction_id;

  -- 13. 즉시 낙찰 (Buy-it-Now) 체크
  IF v_auction.buy_now_price IS NOT NULL AND p_bid_amount >= v_auction.buy_now_price THEN
    UPDATE bids SET status = 'won'
    WHERE auction_id = p_auction_id AND bidder_id = p_bidder_id AND status = 'active';

    UPDATE auctions SET
      status = 'won',
      winner_id = p_bidder_id,
      winning_price = p_bid_amount,
      won_at = now(),
      payment_deadline = now() + INTERVAL '15 minutes',
      updated_at = now()
    WHERE id = p_auction_id;

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
      'buy_now', true,
      'result', 'won',
      'bid_amount', p_bid_amount,
      'previous_bidder_id', v_prev_bidder_id
    );
  END IF;

  -- 14. 자동 연장 (마감 5분 이내 입찰 시)
  IF v_effective_end - now() < (v_auction.auto_extend_min || ' minutes')::INTERVAL THEN
    UPDATE auctions SET
      extended_end_at = now() + (v_auction.auto_extend_min || ' minutes')::INTERVAL
    WHERE id = p_auction_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'bid_amount', p_bid_amount,
    'previous_bidder_id', v_prev_bidder_id,
    'new_end_at', COALESCE(
      (SELECT extended_end_at FROM auctions WHERE id = p_auction_id),
      v_auction.auction_end_at
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
