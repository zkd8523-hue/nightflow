-- ================================================================
-- Migration 077: 보증금 시스템 완전 제거
-- ================================================================
-- 배경: Model B(현장 직접 결제)에서 보증금은 불필요한 복잡도.
--       Toss PG 의존성 제거, 코드 단순화.
-- 제거 대상:
--   - deposits 테이블 (데이터 포함)
--   - auctions.deposit_required, deposit_amount 컬럼
--   - auction_templates.deposit_required 컬럼
--   - check_deposit_status() 함수
--   - place_bid() 내 보증금 검증 로직
-- ================================================================

-- 1. deposits 테이블 삭제
DROP TABLE IF EXISTS deposits CASCADE;

-- 2. auctions 컬럼 제거
ALTER TABLE auctions DROP COLUMN IF EXISTS deposit_required;
ALTER TABLE auctions DROP COLUMN IF EXISTS deposit_amount;

-- 3. auction_templates 컬럼 제거
ALTER TABLE auction_templates DROP COLUMN IF EXISTS deposit_required;

-- 4. check_deposit_status() 함수 삭제
DROP FUNCTION IF EXISTS check_deposit_status(UUID, UUID);

-- 5. place_bid() 재정의 (보증금 검증 제거)
-- 076 기반에서 보증금 관련 로직만 제거
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id UUID,
  p_bidder_id UUID,
  p_bid_amount INTEGER
) RETURNS JSON AS $$
DECLARE
  v_auction RECORD;
  v_effective_end TIMESTAMPTZ;
  v_timer INTEGER;
  v_prev_bidder_id UUID;
  v_extended BOOLEAN := false;
  v_extension_count INTEGER;
BEGIN
  -- 1. 행 잠금 (동시성 제어) + 클럽 이름 JOIN
  SELECT a.*, c.name as club_name INTO v_auction
  FROM auctions a
  JOIN clubs c ON a.club_id = c.id
  WHERE a.id = p_auction_id FOR UPDATE OF a;

  -- 2. NULL 체크 (경매 미존재)
  IF v_auction IS NULL THEN
    RAISE EXCEPTION '경매를 찾을 수 없습니다';
  END IF;

  -- 3. scheduled 경매 자동 활성화
  IF v_auction.status = 'scheduled' AND now() >= v_auction.auction_start_at THEN
    UPDATE auctions SET status = 'active', updated_at = now()
    WHERE id = p_auction_id;
    v_auction.status := 'active';
  END IF;

  -- 4. 상태 검증
  IF v_auction.status != 'active' THEN
    RAISE EXCEPTION '경매가 진행 중이 아닙니다 (현재: %)', v_auction.status;
  END IF;

  -- 5. 종료 시간 확인
  v_effective_end := COALESCE(v_auction.extended_end_at, v_auction.auction_end_at);
  IF now() > v_effective_end THEN
    RAISE EXCEPTION '경매가 종료되었습니다';
  END IF;

  -- 6. 자기 경매 입찰 방지
  IF v_auction.md_id = p_bidder_id THEN
    RAISE EXCEPTION '자신의 경매에 입찰할 수 없습니다';
  END IF;

  -- 7. 차단된 유저 검증
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = p_bidder_id
    AND (is_blocked = true OR (blocked_until IS NOT NULL AND blocked_until > now()))
  ) THEN
    RAISE EXCEPTION '차단된 계정입니다';
  END IF;

  -- 8. 연속 입찰 방지
  IF EXISTS (
    SELECT 1 FROM bids
    WHERE auction_id = p_auction_id
      AND bidder_id = p_bidder_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION '이미 최고 입찰자입니다';
  END IF;

  -- 9. 최소 입찰가 검증
  IF v_auction.current_bid = 0 THEN
    IF p_bid_amount < v_auction.start_price THEN
      RAISE EXCEPTION '시작가 이상으로 입찰해주세요';
    END IF;
  ELSE
    IF p_bid_amount < v_auction.current_bid + v_auction.bid_increment THEN
      RAISE EXCEPTION '최소 입찰 단위(1만원) 이상으로 입찰해주세요';
    END IF;
  END IF;

  -- 10. 이전 최고 입찰자 ID 캡처 (outbid 알림용)
  SELECT bidder_id INTO v_prev_bidder_id FROM bids
  WHERE auction_id = p_auction_id AND status = 'active'
  LIMIT 1;

  -- 11. 기존 최고 입찰 outbid 처리
  UPDATE bids SET status = 'outbid'
  WHERE auction_id = p_auction_id AND status = 'active';

  -- 12. 새 입찰 기록
  INSERT INTO bids (auction_id, bidder_id, bid_amount, status)
  VALUES (p_auction_id, p_bidder_id, p_bid_amount, 'active');

  -- 13. 경매 업데이트
  UPDATE auctions SET
    current_bid = p_bid_amount,
    bid_count = bid_count + 1,
    bidder_count = (SELECT COUNT(DISTINCT bidder_id) FROM bids WHERE auction_id = p_auction_id),
    updated_at = now()
  WHERE id = p_auction_id;

  -- 14. outbid 인앱 알림 생성
  IF v_prev_bidder_id IS NOT NULL AND v_prev_bidder_id != p_bidder_id THEN
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_prev_bidder_id,
      'outbid',
      '입찰이 추월되었습니다',
      v_auction.club_name || ' 경매에서 다른 유저가 ' || to_char(p_bid_amount, 'FM999,999,999') || '원으로 입찰했습니다. 재입찰하여 경쟁에 참여하세요!',
      '/auctions/' || p_auction_id
    );
  END IF;

  -- 15. 즉시 낙찰(BIN) 검사
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

    -- 즉시 낙찰 인앱 알림
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
      'previous_bidder_id', v_prev_bidder_id,
      'new_end_at', now()
    );
  END IF;

  -- 16. 자동 연장 (횟수 제한 적용)
  v_extension_count := v_auction.extension_count;

  IF v_effective_end - now() < (v_auction.auto_extend_min || ' minutes')::INTERVAL THEN
    IF v_auction.extension_count < v_auction.max_extensions THEN
      UPDATE auctions SET
        extended_end_at = now() + (v_auction.auto_extend_min || ' minutes')::INTERVAL,
        extension_count = extension_count + 1
      WHERE id = p_auction_id;

      v_extended := true;
      v_extension_count := v_auction.extension_count + 1;
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'bid_amount', p_bid_amount,
    'buy_now', false,
    'previous_bidder_id', v_prev_bidder_id,
    'extended', v_extended,
    'extension_count', v_extension_count,
    'max_extensions', v_auction.max_extensions,
    'new_end_at', COALESCE(
      (SELECT extended_end_at FROM auctions WHERE id = p_auction_id),
      v_auction.auction_end_at
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION place_bid(UUID, UUID, INTEGER) IS
  'Migration 077: 보증금 검증 제거. BIN + 자동연장 + outbid 알림 유지';
