-- 1. users 컬럼 보장
ALTER TABLE users ADD COLUMN IF NOT EXISTS strike_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strike_updated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ;

-- 2. auctions 컬럼 보장
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS contact_deadline TIMESTAMPTZ;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS contact_timer_minutes INTEGER;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS contact_attempted_at TIMESTAMPTZ;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ;

-- 3. cancel_type ENUM + 컬럼 보장
DO $$ BEGIN
  CREATE TYPE cancellation_type AS ENUM ('user_grace','user_late','mutual','noshow_auto','noshow_md');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS cancel_type cancellation_type;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 4. auctions status CHECK 재정의 ('contacted' 포함)
ALTER TABLE auctions DROP CONSTRAINT IF EXISTS auctions_status_check;
ALTER TABLE auctions ADD CONSTRAINT auctions_status_check
  CHECK (status IN ('draft','scheduled','active','won','unsold','paid','confirmed','cancelled','expired','contacted'));

-- 5. apply_noshow_strike() 재정의 (migration 059 최신 버전)
CREATE OR REPLACE FUNCTION apply_noshow_strike(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
  v_new_strike INTEGER;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION '유저를 찾을 수 없습니다';
  END IF;

  v_new_strike := v_user.strike_count + 1;

  IF v_new_strike >= 4 THEN
    -- 4회 이상: 영구 차단
    UPDATE users SET
      strike_count = v_new_strike,
      is_blocked = true,
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'permanent_block',
      'waiver_used', false
    );

  ELSIF v_new_strike = 3 THEN
    -- 3회: 90일 정지
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = now() + INTERVAL '90 days',
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_90_days',
      'blocked_until', now() + INTERVAL '90 days',
      'waiver_used', false
    );

  ELSIF v_new_strike = 2 THEN
    -- 2회: 30일 정지
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = now() + INTERVAL '30 days',
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_30_days',
      'blocked_until', now() + INTERVAL '30 days',
      'waiver_used', false
    );

  ELSE
    -- 1회: 7일 정지
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = now() + INTERVAL '7 days',
      noshow_count = noshow_count + 1
    WHERE id = p_user_id;

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_7_days',
      'blocked_until', now() + INTERVAL '7 days',
      'waiver_used', false
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. calculate_contact_timer() 재정의 (migration 059 최신 버전)
CREATE OR REPLACE FUNCTION calculate_contact_timer(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
BEGIN
  -- 기존 4단계 (피크 15분/준피크 20분/비피크 30분) → 20분 단일
  -- 근거: 연락 시도(버튼 클릭)까지만 측정
  -- 알림 인지(1-5분) + 앱 확인(1-2분) + 클릭(0.5분) = 3-8분 + 마진
  RETURN 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. fallback_to_next_bidder() 재정의 (migration 060 최신 버전)
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
