-- 026: 플랫폼 서비스 수수료 인프라
-- 배경: MD 수수료 0% 유지 + 유저 사이드 서비스 수수료(Buyer's Premium) 도입 준비
-- 현재: platform_fee_rate = 0.00 (Beta), 향후 5~7%로 변경 예정
-- 핵심: total_amount = winning_price + platform_fee_amt

-- 1. 플랫폼 설정 테이블 (수수료율 등 관리자 설정)
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (key, value, description) VALUES
  ('platform_fee_rate', '0.00', '유저 서비스 수수료율 (0.00 = 0%, 0.05 = 5%)'),
  ('platform_fee_label', '안전 거래 수수료', '수수료 표시 명칭')
ON CONFLICT (key) DO NOTHING;

-- RLS: Admin만 수정, 전체 읽기
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read platform_settings" ON platform_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage platform_settings" ON platform_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- 2. transactions 테이블에 플랫폼 수수료 컬럼 추가
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS platform_fee_rate DECIMAL NOT NULL DEFAULT 0.00;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS platform_fee_amt INTEGER NOT NULL DEFAULT 0;

-- 3. place_bid() 재정의: 플랫폼 수수료 계산 포함
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id UUID,
  p_bidder_id UUID,
  p_bid_amount INTEGER
) RETURNS JSON AS $$
DECLARE
  v_auction auctions;
  v_effective_end TIMESTAMPTZ;
  v_prev_bidder_id UUID;
  v_fee_rate DECIMAL;
  v_fee_amt INTEGER;
  v_total_amount INTEGER;
BEGIN
  -- 1. 행 잠금 (동시성 제어)
  SELECT * INTO v_auction FROM auctions
  WHERE id = p_auction_id FOR UPDATE;

  IF v_auction IS NULL THEN
    RAISE EXCEPTION '경매를 찾을 수 없습니다';
  END IF;

  -- 2. scheduled 경매 자동 활성화
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

  -- 6. 차단된 유저 검증 (시한부 차단 포함)
  IF EXISTS (
    SELECT 1 FROM users WHERE id = p_bidder_id
    AND (is_blocked = true OR (blocked_until IS NOT NULL AND blocked_until > now()))
  ) THEN
    RAISE EXCEPTION '차단된 계정입니다. 이용 제한 중입니다.';
  END IF;

  -- 7. 연속 입찰 방지
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

  -- 9. 이전 최고 입찰자 ID 저장 (outbid 알림용)
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

  -- 13. 플랫폼 수수료율 조회
  SELECT COALESCE((SELECT value::DECIMAL FROM platform_settings WHERE key = 'platform_fee_rate'), 0.00)
  INTO v_fee_rate;
  v_fee_amt := (p_bid_amount * v_fee_rate)::INTEGER;
  v_total_amount := p_bid_amount + v_fee_amt;

  -- 14. 즉시 낙찰 (Buy-it-Now) 체크
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
      platform_fee_rate, platform_fee_amt,
      payment_status, reservation_code
    ) VALUES (
      p_auction_id, p_bidder_id, v_auction.md_id,
      p_bid_amount, v_total_amount,
      0.00, 0,
      v_fee_rate * 100, v_fee_amt,
      'pending',
      'NF-' || upper(substr(md5(random()::text), 1, 4))
    );

    RETURN json_build_object(
      'success', true,
      'buy_now', true,
      'result', 'won',
      'bid_amount', p_bid_amount,
      'platform_fee_amt', v_fee_amt,
      'total_amount', v_total_amount,
      'previous_bidder_id', v_prev_bidder_id
    );
  END IF;

  -- 15. 자동 연장 (마감 5분 이내 입찰 시)
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

-- 4. close_auction() 재정의: 플랫폼 수수료 계산 포함
CREATE OR REPLACE FUNCTION close_auction(
  p_auction_id UUID
) RETURNS JSON AS $$
DECLARE
  v_auction auctions;
  v_winning_bid bids;
  v_fee_rate DECIMAL;
  v_fee_amt INTEGER;
  v_total_amount INTEGER;
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

    -- 플랫폼 수수료 계산
    SELECT COALESCE((SELECT value::DECIMAL FROM platform_settings WHERE key = 'platform_fee_rate'), 0.00)
    INTO v_fee_rate;
    v_fee_amt := (v_winning_bid.bid_amount * v_fee_rate)::INTEGER;
    v_total_amount := v_winning_bid.bid_amount + v_fee_amt;

    INSERT INTO transactions (
      auction_id, buyer_id, md_id,
      winning_price, total_amount,
      md_commission_rate, md_commission_amt,
      platform_fee_rate, platform_fee_amt,
      payment_status, reservation_code
    ) VALUES (
      p_auction_id, v_winning_bid.bidder_id, v_auction.md_id,
      v_winning_bid.bid_amount, v_total_amount,
      0.00, 0,
      v_fee_rate * 100, v_fee_amt,
      'pending',
      'NF-' || upper(substr(md5(random()::text), 1, 4))
    );

    RETURN json_build_object(
      'success', true,
      'result', 'won',
      'winner_id', v_winning_bid.bidder_id,
      'winning_price', v_winning_bid.bid_amount,
      'platform_fee_amt', v_fee_amt,
      'total_amount', v_total_amount
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
