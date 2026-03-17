-- ============================================
-- NightFlow: place_bid / close_auction 보안 수정
-- 문제: RLS가 일반 유저의 auctions UPDATE를 차단하여
--       place_bid() 내부의 UPDATE가 무시됨
-- 해결: SECURITY DEFINER로 함수 권한 상승
-- ============================================

-- 1. 잘못된 입찰 기록 정리 (검증 없이 생성된 데이터)
DELETE FROM bids WHERE auction_id = 'a50b838e-2829-4dd3-8f88-bdbd8811dc0f';

-- 2. place_bid() 재생성 (SECURITY DEFINER 추가)
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

  -- NULL 체크 (경매 미존재)
  IF v_auction IS NULL THEN
    RAISE EXCEPTION '경매를 찾을 수 없습니다';
  END IF;

  -- 2. 상태 검증
  IF v_auction.status != 'active' THEN
    RAISE EXCEPTION '경매가 진행 중이 아닙니다 (현재: %)', v_auction.status;
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
    updated_at = now()
  WHERE id = p_auction_id;

  -- 10. 자동 연장 (마감 5분 이내 입찰 시)
  IF v_effective_end - now() < (v_auction.auto_extend_min || ' minutes')::INTERVAL THEN
    UPDATE auctions SET
      extended_end_at = now() + (v_auction.auto_extend_min || ' minutes')::INTERVAL
    WHERE id = p_auction_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'bid_amount', p_bid_amount,
    'new_end_at', COALESCE(
      (SELECT extended_end_at FROM auctions WHERE id = p_auction_id),
      v_auction.auction_end_at
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. close_auction() 재생성 (SECURITY DEFINER 추가)
CREATE OR REPLACE FUNCTION close_auction(
  p_auction_id UUID
) RETURNS JSON AS $$
DECLARE
  v_auction auctions;
  v_winning_bid bids;
BEGIN
  SELECT * INTO v_auction FROM auctions
  WHERE id = p_auction_id FOR UPDATE;

  IF v_auction IS NULL THEN
    RAISE EXCEPTION '경매를 찾을 수 없습니다';
  END IF;

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
    UPDATE bids SET status = 'won' WHERE id = v_winning_bid.id;
    UPDATE auctions SET
      status = 'won',
      winner_id = v_winning_bid.bidder_id,
      winning_price = v_winning_bid.bid_amount,
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
      p_auction_id, v_winning_bid.bidder_id, v_auction.md_id,
      v_winning_bid.bid_amount, v_winning_bid.bid_amount,
      10.00, (v_winning_bid.bid_amount * 0.10)::INTEGER,
      'pending',
      'NF-' || upper(substr(md5(random()::text), 1, 4))
    );

    RETURN json_build_object(
      'success', true,
      'result', 'won',
      'winner_id', v_winning_bid.bidder_id,
      'winning_price', v_winning_bid.bid_amount
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 테스트용: scheduled 경매를 active로 변경
UPDATE auctions
SET status = 'active'
WHERE id = 'a50b838e-2829-4dd3-8f88-bdbd8811dc0f'
  AND status = 'scheduled';
