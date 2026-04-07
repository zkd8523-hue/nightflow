-- Migration 087: 이벤트 임박도 기반 동적 contact_deadline (얼리버드 재활성화)
-- 날짜: 2026-04-08
-- 기반: 085_disable_earlybird_contact_deadline.sql 베이스
--
-- 배경:
--   Migration 085가 얼리버드(listing_type='auction')의 contact_deadline을
--   일률적으로 NULL 처리하면서 expire-contacts cron이 무력화되고, MD가
--   응답을 방치하면 won 상태가 무한히 남는 문제가 발생.
--
-- 사용자 결정:
--   - 얼리버드 시한을 다시 켜되, 이벤트 임박도에 따라 차등 적용.
--   - event_date가 2일 이상 남음 → 3시간(180분)
--   - event_date가 당일 또는 내일 → 30분
--   - oldonly listing_type='instant'은 기존대로 won 단계를 거치지 않으므로
--     안전망으로 NULL 유지.
--
-- 만료 처리:
--   기존 expire-contacts Edge Function이 status='won' + contact_deadline < now()
--   조건으로 그대로 처리. 코드 변경 없이 자동으로 새 시한을 따라감.

BEGIN;

-- ============================================================================
-- 1. 동적 시한 산출 함수 (신규)
-- ============================================================================
-- 기존 calculate_contact_timer(p_user_id UUID)는 그대로 유지하고,
-- auction_id 기준 새 시그니처를 별도로 도입해 회귀 위험을 차단.
CREATE OR REPLACE FUNCTION calculate_contact_timer_for_auction(p_auction_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_event_date DATE;
  v_listing_type TEXT;
BEGIN
  SELECT event_date, listing_type
    INTO v_event_date, v_listing_type
    FROM auctions
   WHERE id = p_auction_id;

  -- instant은 won 단계를 거치지 않음. 안전망으로 NULL 반환.
  IF v_listing_type IS DISTINCT FROM 'auction' THEN
    RETURN NULL;
  END IF;

  -- 이벤트가 2일 이상 남음 → 3시간 (180분)
  -- 그 외(당일/내일) → 30분
  IF v_event_date IS NULL OR v_event_date >= CURRENT_DATE + INTERVAL '2 days' THEN
    RETURN 180;
  ELSE
    RETURN 30;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION calculate_contact_timer_for_auction(UUID) IS
  'Migration 087: 얼리버드 contact_deadline 동적 산출. event_date 2일+ → 180분, 당일/내일 → 30분, instant → NULL.';

-- ============================================================================
-- 2. close_auction() 재정의 (085 베이스 + 동적 시한 적용)
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
    -- 동적 시한 산출 (얼리버드만 NOT NULL)
    v_timer := calculate_contact_timer_for_auction(p_auction_id);

    UPDATE bids SET status = 'won' WHERE id = v_winning_bid.id;

    UPDATE auctions SET
      status = 'won',
      winner_id = v_winning_bid.bidder_id,
      winning_price = v_winning_bid.bid_amount,
      won_at = now(),
      contact_deadline = CASE
        WHEN v_timer IS NULL THEN NULL
        ELSE now() + (v_timer || ' minutes')::INTERVAL
      END,
      contact_timer_minutes = v_timer,
      updated_at = now()
    WHERE id = p_auction_id;

    -- 인앱 알림 (060 동일)
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

COMMENT ON FUNCTION close_auction(UUID) IS
  'Migration 087: 085 기반 + 얼리버드 contact_deadline 동적 부여 (event_date 임박도 기반).';

-- ============================================================================
-- 3. place_bid() 재정의 (085 베이스 + BIN 블록 동적 시한)
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
  -- 1. 행 잠금
  SELECT a.*, c.name as club_name INTO v_auction
  FROM auctions a
  JOIN clubs c ON a.club_id = c.id
  WHERE a.id = p_auction_id FOR UPDATE OF a;

  -- 2. NULL 체크
  IF v_auction IS NULL THEN
    RAISE EXCEPTION '경매를 찾을 수 없습니다';
  END IF;

  -- 3. scheduled 자동 활성화
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

  -- 7. 차단/탈퇴 유저 검증
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

  -- 10. 이전 최고 입찰자 ID 캡처
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

  -- 14. outbid 인앱 알림
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
    -- 동적 시한 산출
    v_timer := calculate_contact_timer_for_auction(p_auction_id);

    UPDATE bids SET status = 'won'
    WHERE auction_id = p_auction_id AND bidder_id = p_bidder_id AND bid_amount = p_bid_amount;

    UPDATE auctions SET
      status = 'won',
      winner_id = p_bidder_id,
      winning_price = p_bid_amount,
      won_at = now(),
      contact_deadline = CASE
        WHEN v_timer IS NULL THEN NULL
        ELSE now() + (v_timer || ' minutes')::INTERVAL
      END,
      contact_timer_minutes = v_timer,
      updated_at = now()
    WHERE id = p_auction_id;

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

  -- 17. 자동 연장
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
  'Migration 087: 085 기반 + BIN 즉시낙찰 시 얼리버드 contact_deadline 동적 부여.';

-- ============================================================================
-- 4. fallback_to_next_bidder() 재정의 (085 베이스 + 동적 시한)
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
    -- 동적 시한 산출 (차순위 낙찰 시점 기준 — event_date가 임박했다면 30분, 아니면 180분)
    v_timer := calculate_contact_timer_for_auction(p_auction_id);

    UPDATE bids SET status = 'won' WHERE id = v_next_bid.id;

    UPDATE auctions SET
      winner_id = v_next_bid.bidder_id,
      winning_price = v_next_bid.bid_amount,
      contact_deadline = CASE
        WHEN v_timer IS NULL THEN NULL
        ELSE now() + (v_timer || ' minutes')::INTERVAL
      END,
      contact_timer_minutes = v_timer,
      updated_at = now()
    WHERE id = p_auction_id;

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

COMMENT ON FUNCTION fallback_to_next_bidder(UUID) IS
  'Migration 087: 085 기반 + 차순위 낙찰자에게 동적 contact_deadline 부여.';

-- ============================================================================
-- 5. 운영 데이터 백필
-- ============================================================================
-- 현재 listing_type='auction' + status='won' + contact_deadline IS NULL 인 건들에
-- 새 시한을 부여. 단, won_at 기준으로 잡으면 다음 cron 사이클에서 즉시 노쇼
-- 처리될 위험이 있으므로 now() 기준으로 그레이스 윈도우를 부여한다.
UPDATE auctions
SET contact_deadline = now() + (
      calculate_contact_timer_for_auction(id) || ' minutes'
    )::INTERVAL,
    contact_timer_minutes = calculate_contact_timer_for_auction(id),
    updated_at = now()
WHERE listing_type = 'auction'
  AND status = 'won'
  AND contact_deadline IS NULL
  AND calculate_contact_timer_for_auction(id) IS NOT NULL;

COMMIT;
