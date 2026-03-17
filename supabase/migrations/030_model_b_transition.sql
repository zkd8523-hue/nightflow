-- ============================================================
-- NightFlow Model B 전환: 결제 중개 제거 + 연락 확인 플로우
-- ============================================================
-- 변경 사항:
-- 1. auctions: contact_deadline, contact_timer_minutes 추가, 'contacted' 상태 추가
-- 2. users: strike_count, strike_updated_at, instagram 추가
-- 3. close_auction() 재정의: transaction 미생성, contact_deadline 설정
-- 4. place_bid() 재정의: BIN 시 transaction 미생성
-- 5. apply_noshow_strike() 신규: 누진 스트라이크
-- 6. fallback_to_next_bidder() 신규: 차순위 낙찰

-- ================================
-- 1. auctions 테이블 변경
-- ================================

-- 연락 타이머 컬럼 추가
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS contact_deadline TIMESTAMPTZ;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS contact_timer_minutes INTEGER DEFAULT 30;

-- status CHECK 제약 재정의 ('contacted' 추가)
ALTER TABLE auctions DROP CONSTRAINT IF EXISTS auctions_status_check;
ALTER TABLE auctions ADD CONSTRAINT auctions_status_check
  CHECK (status IN ('draft', 'scheduled', 'active', 'won', 'unsold', 'paid', 'confirmed', 'cancelled', 'expired', 'contacted'));

-- ================================
-- 2. users 테이블 변경
-- ================================

-- 스트라이크 시스템
ALTER TABLE users ADD COLUMN IF NOT EXISTS strike_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strike_updated_at TIMESTAMPTZ;

-- MD 인스타그램 연락처
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram TEXT;

-- ================================
-- 3. 동적 타이머 계산 함수 (Model B + Pass)
-- ================================
CREATE OR REPLACE FUNCTION calculate_contact_timer(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  v_dow INTEGER;   -- 0=일, 1=월, ..., 5=금, 6=토
  v_hour INTEGER;
  v_base INTEGER;
  v_has_pass BOOLEAN := false;
BEGIN
  v_dow := EXTRACT(DOW FROM now());
  v_hour := EXTRACT(HOUR FROM now());

  -- 기본 시간 계산
  IF v_dow IN (5, 6) AND (v_hour >= 22 OR v_hour < 2) THEN
    v_base := 15; -- 피크
  ELSIF (v_dow = 6 OR v_dow = 0) AND v_hour >= 2 AND v_hour < 4 THEN
    v_base := 20; -- 준피크 새벽
  ELSIF (v_dow IN (5, 6) AND v_hour >= 19 AND v_hour < 22) OR v_dow IN (4, 0) THEN
    v_base := 20; -- 준피크
  ELSE
    v_base := 30; -- 비피크
  END IF;

  -- NightFlow Pass: 타이머 10분 연장
  IF p_user_id IS NOT NULL THEN
    SELECT (pass_expires_at > now()) INTO v_has_pass FROM users WHERE id = p_user_id;
    IF v_has_pass THEN
      v_base := v_base + 10;
    END IF;
  END IF;

  RETURN v_base;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- 4. close_auction() 재정의 — Model B + Pass
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

  -- 최고 입찰 조회
  SELECT * INTO v_winning_bid FROM bids
  WHERE auction_id = p_auction_id AND status = 'active'
  ORDER BY bid_amount DESC LIMIT 1;

  IF v_winning_bid IS NULL OR v_winning_bid.bid_amount < v_auction.reserve_price THEN
    -- 유찰
    UPDATE auctions SET status = 'unsold', updated_at = now()
    WHERE id = p_auction_id;

    RETURN json_build_object('success', true, 'result', 'unsold');
  ELSE
    -- 낙찰: 패스 반영 타이머 계산
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

    -- Model B: transaction 미생성 (결제 중개 없음)

    RETURN json_build_object(
      'success', true,
      'result', 'won',
      'winner_id', v_winning_bid.bidder_id,
      'winning_price', v_winning_bid.bid_amount,
      'contact_timer_minutes', v_timer
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- 5. place_bid() 재정의 — Model B + Pass (BIN 수정)
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

  -- 5. 차단된 유저 검증 (스트라이크 포함)
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = p_bidder_id
    AND (is_blocked = true OR (blocked_until IS NOT NULL AND blocked_until > now()))
  ) THEN
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

    -- Model B: transaction 미생성

    RETURN json_build_object(
      'success', true,
      'bid_amount', p_bid_amount,
      'buy_now', true,
      'result', 'won',
      'contact_timer_minutes', v_timer,
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

-- ================================
-- 6. 노쇼 스트라이크 함수 (Model B + Pass)
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

  -- NightFlow Pass: 스트라이크 면제권(Waiver) 사용
  IF v_user.strike_waiver_count > 0 AND (v_user.pass_expires_at > now()) THEN
    UPDATE users SET 
      strike_waiver_count = strike_waiver_count - 1,
      noshow_count = noshow_count + 1 -- 기록만 남김
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_user.strike_count,
      'action', 'waived',
      'waiver_used', true,
      'blocked_until', null
    );
  END IF;

  -- 일반 스트라이크 로직
  v_new_strike := v_user.strike_count + 1;

  IF v_new_strike >= 3 THEN
    -- 3회: 영구 차단
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
    -- 2회: 90일 정지
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
    -- 1회: 14일 정지
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
$$ LANGUAGE plpgsql;

-- ================================
-- 7. 차순위 낙찰 함수 (신규)
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

  -- 현재 낙찰자의 bid를 cancelled로 변경
  UPDATE bids SET status = 'cancelled'
  WHERE auction_id = p_auction_id AND status = 'won';

  -- 차순위 입찰 조회 (outbid 중 가장 높은 금액)
  SELECT * INTO v_next_bid FROM bids
  WHERE auction_id = p_auction_id
    AND status = 'outbid'
    AND bidder_id != v_auction.winner_id
  ORDER BY bid_amount DESC LIMIT 1;

  IF v_next_bid IS NULL OR v_next_bid.bid_amount < v_auction.reserve_price THEN
    -- 차순위 없음 → 유찰
    UPDATE auctions SET
      status = 'unsold',
      winner_id = NULL,
      winning_price = NULL,
      contact_deadline = NULL,
      updated_at = now()
    WHERE id = p_auction_id;

    RETURN json_build_object('success', true, 'result', 'unsold', 'reason', 'no_next_bidder');
  ELSE
    -- 차순위 낙찰
    v_timer := calculate_contact_timer();

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
$$ LANGUAGE plpgsql;
