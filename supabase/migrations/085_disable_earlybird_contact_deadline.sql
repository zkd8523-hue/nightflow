-- Migration 085: 얼리버드 경매(listing_type='auction')의 contact_deadline 비활성화
-- 날짜: 2026-04-07
-- 기반:
--   - close_auction, fallback_to_next_bidder: 060_move_won_notification_to_db.sql
--   - place_bid: 082_place_bid_deleted_user_guard.sql
--
-- 문제:
--   얼리버드 경매는 미래 날짜(1~2일 후)의 사전 예약이지만, 낙찰 시 15분
--   contact_deadline이 일률적으로 설정되어 expire-contacts cron이 1분마다
--   노쇼 처리 → 차순위 낙찰로 넘어가는 사고 발생 가능.
--
-- 해결:
--   listing_type='auction'(=얼리버드, AuctionForm advance 모드 전용)인 경우
--   낙찰 시 contact_deadline=NULL, contact_timer_minutes=NULL로 저장.
--   expire-contacts는 이미 .not('contact_deadline','is',null) 필터를 가지고
--   있으므로 자연 제외됨. 노쇼 처리는 후속 D-Day 체크인 플랜에서 담당.
--
-- 범위 외 (의도적으로 미변경):
--   - in_app_notifications 메시지("MD에게 연락하세요!")
--   - expire-contacts Edge Function

-- ============================================================================
-- 1. close_auction() 재정의 (060 베이스 + listing_type CASE)
-- ============================================================================
CREATE OR REPLACE FUNCTION close_auction(
  p_auction_id UUID
) RETURNS JSON AS $$
DECLARE
  v_auction RECORD;
  v_winning_bid RECORD;
  v_timer INTEGER;
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
      contact_deadline = CASE
        WHEN v_auction.listing_type = 'auction' THEN NULL
        ELSE now() + (v_timer || ' minutes')::INTERVAL
      END,
      contact_timer_minutes = CASE
        WHEN v_auction.listing_type = 'auction' THEN NULL
        ELSE v_timer
      END,
      updated_at = now()
    WHERE id = p_auction_id;

    -- [060] 인앱 알림 생성
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
      'contact_timer_minutes', CASE
        WHEN v_auction.listing_type = 'auction' THEN NULL
        ELSE v_timer
      END
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION close_auction(UUID) IS
  'Migration 085: 060 기반 + 얼리버드(listing_type=auction)는 contact_deadline NULL';

-- ============================================================================
-- 2. place_bid() 재정의 (082 전체 복제 + BIN 블록만 listing_type CASE 적용)
-- ============================================================================
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
  v_recent_md_notif BOOLEAN;
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

  -- 7. 차단/탈퇴 유저 검증 (Migration 082: deleted_at 가드 추가)
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = p_bidder_id
    AND (
      is_blocked = true
      OR (blocked_until IS NOT NULL AND blocked_until > now())
      OR deleted_at IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION '입찰할 수 없는 계정입니다';
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

  -- 14. outbid 인앱 알림 생성 (이전 최고 입찰자에게, DB 트랜잭션 내 원자적 생성)
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

  -- 15. MD 입찰 알림 (5분 이내 중복 방지)
  SELECT EXISTS (
    SELECT 1 FROM in_app_notifications
    WHERE user_id = v_auction.md_id
      AND type = 'md_new_bid'
      AND action_url = '/auctions/' || p_auction_id
      AND created_at > now() - INTERVAL '5 minutes'
  ) INTO v_recent_md_notif;

  IF NOT v_recent_md_notif THEN
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_auction.md_id,
      'md_new_bid',
      '새 입찰이 들어왔습니다',
      v_auction.club_name || ' 경매에 ' || to_char(p_bid_amount, 'FM999,999,999') || '원 입찰이 들어왔습니다. (총 ' || (v_auction.bid_count + 1) || '건)',
      '/auctions/' || p_auction_id
    );
  END IF;

  -- 16. 즉시 낙찰(BIN) 검사
  IF v_auction.buy_now_price IS NOT NULL AND p_bid_amount >= v_auction.buy_now_price THEN
    v_timer := calculate_contact_timer(p_bidder_id);

    UPDATE bids SET status = 'won'
    WHERE auction_id = p_auction_id AND bidder_id = p_bidder_id AND bid_amount = p_bid_amount;

    UPDATE auctions SET
      status = 'won',
      winner_id = p_bidder_id,
      winning_price = p_bid_amount,
      won_at = now(),
      contact_deadline = CASE
        WHEN v_auction.listing_type = 'auction' THEN NULL
        ELSE now() + (v_timer || ' minutes')::INTERVAL
      END,
      contact_timer_minutes = CASE
        WHEN v_auction.listing_type = 'auction' THEN NULL
        ELSE v_timer
      END,
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
      'contact_timer_minutes', CASE
        WHEN v_auction.listing_type = 'auction' THEN NULL
        ELSE v_timer
      END,
      'previous_bidder_id', v_prev_bidder_id,
      'new_end_at', now()
    );
  END IF;

  -- 17. 자동 연장 (횟수 제한 적용)
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
  'Migration 085: 082 기반 + 얼리버드(listing_type=auction) BIN 낙찰 시 contact_deadline NULL';

-- ============================================================================
-- 3. fallback_to_next_bidder() 재정의 (060 베이스 + listing_type CASE)
-- ============================================================================
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
      contact_deadline = CASE
        WHEN v_auction.listing_type = 'auction' THEN NULL
        ELSE now() + (v_timer || ' minutes')::INTERVAL
      END,
      contact_timer_minutes = CASE
        WHEN v_auction.listing_type = 'auction' THEN NULL
        ELSE v_timer
      END,
      updated_at = now()
    WHERE id = p_auction_id;

    -- [060] 인앱 알림 생성
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
      'contact_timer_minutes', CASE
        WHEN v_auction.listing_type = 'auction' THEN NULL
        ELSE v_timer
      END
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fallback_to_next_bidder(UUID) IS
  'Migration 085: 060 기반 + 얼리버드(listing_type=auction) 차순위 낙찰 시 contact_deadline NULL';

-- ============================================================================
-- 4. 기존 데이터 백필 (운영 중 contact_deadline이 살아있는 얼리버드 경매)
-- ============================================================================
-- 마이그레이션 적용 직후 1분 안에 expire-contacts cron이 노쇼 처리할 위험을
-- 차단. status='won'으로만 한정하여 이미 contacted/cancelled로 전환된 건은
-- 영향 없음.
UPDATE auctions
SET contact_deadline = NULL,
    contact_timer_minutes = NULL,
    updated_at = now()
WHERE listing_type = 'auction'
  AND status = 'won'
  AND contact_deadline IS NOT NULL;
