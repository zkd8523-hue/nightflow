-- ============================================================================
-- Migration 088: 차순위 opt-in 낙찰 시스템
--
-- 기존: fallback_to_next_bidder() → 차순위 즉시 낙찰 (동의 없음)
-- 변경: fallback_to_next_bidder() → 차순위에게 1시간 수락 제안
--       차순위가 수락하면 → 낙찰 처리 + contact_deadline=30분
--       1시간 미수락 → expire-contacts cron이 다음 차순위로 전달 (패널티 없음)
--
-- 신규 컬럼 (auctions):
--   fallback_offered_to      UUID  → 현재 제안 받은 차순위 유저 ID
--   fallback_offered_at      TIMESTAMPTZ → 제안 시각
--   fallback_deadline        TIMESTAMPTZ → 수락 마감 (제안 시각 + 1시간)
-- ============================================================================

-- 1. auctions 테이블에 fallback 컬럼 추가
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS fallback_offered_to UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fallback_offered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fallback_deadline TIMESTAMPTZ;

-- 2. InAppNotificationType에 'fallback_offer' 추가
--    (DB enum이 아닌 TypeScript union이므로 DB 변경 불필요)

-- 3. fallback_to_next_bidder() 재정의: opt-in 방식
--    기존: 즉시 낙찰 처리
--    변경: auctions.fallback_offered_to 설정 + 인앱 알림 → 실제 낙찰은 수락 시
CREATE OR REPLACE FUNCTION fallback_to_next_bidder(
  p_auction_id UUID
) RETURNS JSON AS $$
DECLARE
  v_auction  RECORD;
  v_next_bid RECORD;
  v_excluded_ids UUID[];
BEGIN
  SELECT a.*, c.name as club_name INTO v_auction
  FROM auctions a
  JOIN clubs c ON a.club_id = c.id
  WHERE a.id = p_auction_id FOR UPDATE;

  IF v_auction.status != 'won' THEN
    RAISE EXCEPTION '낙찰 상태가 아닌 경매입니다 (status=%). 차순위 제안 불가.', v_auction.status;
  END IF;

  -- 이미 제안 중인 차순위가 있으면 그 유저도 제외 대상에 포함
  -- (연속 호출 방지: 이전 제안이 만료돼 다시 호출된 경우 새로운 차순위 찾기)
  v_excluded_ids := ARRAY[v_auction.winner_id];
  IF v_auction.fallback_offered_to IS NOT NULL THEN
    v_excluded_ids := v_excluded_ids || ARRAY[v_auction.fallback_offered_to];
  END IF;

  -- 기존 낙찰 bid를 'cancelled'로 전환 (제안 이전 winner 처리)
  UPDATE bids SET status = 'cancelled'
  WHERE auction_id = p_auction_id
    AND status = 'won';

  -- 다음 차순위 탐색 (기존 winner + 이미 제안받은 유저 제외)
  SELECT * INTO v_next_bid FROM bids
  WHERE auction_id = p_auction_id
    AND status = 'outbid'
    AND bidder_id != ALL(v_excluded_ids)
  ORDER BY bid_amount DESC LIMIT 1;

  -- 차순위 없음 → unsold
  IF v_next_bid IS NULL OR v_next_bid.bid_amount < v_auction.reserve_price THEN
    UPDATE auctions SET
      status            = 'unsold',
      winner_id         = NULL,
      winning_price     = NULL,
      contact_deadline  = NULL,
      fallback_offered_to   = NULL,
      fallback_offered_at   = NULL,
      fallback_deadline     = NULL,
      updated_at        = now()
    WHERE id = p_auction_id;

    RETURN json_build_object(
      'success', true,
      'result',  'unsold',
      'reason',  'no_next_bidder'
    );
  END IF;

  -- 차순위에게 1시간 opt-in 제안
  UPDATE auctions SET
    -- 낙찰 필드는 아직 비워둠 (수락 후 채움)
    winner_id             = NULL,
    winning_price         = NULL,
    contact_deadline      = NULL,
    contact_timer_minutes = NULL,
    -- 제안 정보 기록
    fallback_offered_to   = v_next_bid.bidder_id,
    fallback_offered_at   = now(),
    fallback_deadline     = now() + INTERVAL '1 hour',
    updated_at            = now()
  WHERE id = p_auction_id;

  -- 인앱 알림: 차순위에게 제안 알림
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_next_bid.bidder_id,
    'fallback_won',
    '🎉 차순위 낙찰 제안이 도착했습니다!',
    v_auction.club_name || ' 테이블 ' || to_char(v_next_bid.bid_amount, 'FM999,999,999') ||
    '원 낙찰 기회입니다. 1시간 안에 수락하세요!',
    '/my-bids?tab=ended'
  );

  RETURN json_build_object(
    'success',           true,
    'result',            'fallback_offered',
    'offered_to',        v_next_bid.bidder_id,
    'offered_bid_amount', v_next_bid.bid_amount,
    'fallback_deadline', (now() + INTERVAL '1 hour')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fallback_to_next_bidder(UUID) IS
  'Migration 088: opt-in 방식 — 즉시 낙찰 대신 1시간 수락 제안. 수락 시 accept_fallback()으로 처리.';

-- 4. accept_fallback(): 차순위 수락 처리 RPC
--    클라이언트가 직접 호출 (POST /api/auction/accept-fallback → supabase.rpc)
CREATE OR REPLACE FUNCTION accept_fallback(
  p_auction_id UUID,
  p_user_id    UUID
) RETURNS JSON AS $$
DECLARE
  v_auction RECORD;
  v_timer   INTEGER;
BEGIN
  SELECT a.*, c.name as club_name INTO v_auction
  FROM auctions a
  JOIN clubs c ON a.club_id = c.id
  WHERE a.id = p_auction_id FOR UPDATE;

  -- 검증: 제안 상태 확인
  IF v_auction.fallback_offered_to IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION '이 경매의 차순위 제안 대상이 아닙니다.';
  END IF;

  IF v_auction.fallback_deadline IS NULL OR v_auction.fallback_deadline < now() THEN
    RAISE EXCEPTION '차순위 수락 시간이 만료되었습니다.';
  END IF;

  -- 동적 contact_deadline 산출 (이벤트 이틀 이상 남으면 180분, 아니면 30분)
  v_timer := calculate_contact_timer_for_auction(p_auction_id);

  -- 낙찰 처리
  UPDATE bids SET status = 'won'
  WHERE auction_id = p_auction_id
    AND bidder_id  = p_user_id
    AND status     = 'outbid';

  UPDATE auctions SET
    status                = 'won',
    winner_id             = p_user_id,
    winning_price         = (
      SELECT bid_amount FROM bids
      WHERE auction_id = p_auction_id AND bidder_id = p_user_id AND status = 'won'
      ORDER BY bid_amount DESC LIMIT 1
    ),
    won_at                = now(),
    contact_deadline      = CASE
      WHEN v_timer IS NULL THEN NULL
      ELSE now() + (v_timer || ' minutes')::INTERVAL
    END,
    contact_timer_minutes = v_timer,
    fallback_offered_to   = NULL,
    fallback_offered_at   = NULL,
    fallback_deadline     = NULL,
    fallback_from_winner_id = v_auction.fallback_from_winner_id, -- 유지
    updated_at            = now()
  WHERE id = p_auction_id;

  -- 인앱 알림: 낙찰 확정
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    p_user_id,
    'auction_won',
    '낙찰 확정!',
    v_auction.club_name || ' 테이블을 ' ||
    (SELECT to_char(bid_amount, 'FM999,999,999') FROM bids WHERE auction_id = p_auction_id AND bidder_id = p_user_id AND status = 'won' LIMIT 1) ||
    '원에 낙찰받았습니다. MD에게 연락하세요!',
    '/my-bids?tab=ended'
  );

  RETURN json_build_object(
    'success',               true,
    'result',                'accepted',
    'contact_timer_minutes', v_timer
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION accept_fallback(UUID, UUID) IS
  'Migration 088: 차순위 수락 처리. fallback_deadline 이내에만 호출 가능.';

-- 5. decline_fallback(): 차순위 거절 처리 RPC
CREATE OR REPLACE FUNCTION decline_fallback(
  p_auction_id UUID,
  p_user_id    UUID
) RETURNS JSON AS $$
DECLARE
  v_auction RECORD;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;

  IF v_auction.fallback_offered_to IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION '이 경매의 차순위 제안 대상이 아닙니다.';
  END IF;

  -- fallback_offered_to를 비워서 다음 fallback_to_next_bidder() 호출 시 이 유저 제외되도록
  -- status는 'won' 유지 (expire-contacts가 다음 차순위 탐색)
  UPDATE auctions SET
    fallback_offered_to = NULL,
    fallback_offered_at = NULL,
    fallback_deadline   = NULL,
    updated_at          = now()
  WHERE id = p_auction_id;

  -- 거절한 유저 bid를 cancelled로 전환 (재등장 방지)
  UPDATE bids SET status = 'cancelled'
  WHERE auction_id  = p_auction_id
    AND bidder_id   = p_user_id
    AND status      = 'outbid';

  -- 즉시 다음 차순위 탐색
  PERFORM fallback_to_next_bidder(p_auction_id);

  RETURN json_build_object('success', true, 'result', 'declined');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION decline_fallback(UUID, UUID) IS
  'Migration 088: 차순위 거절 → 해당 유저 bid 취소 + 즉시 다음 차순위 탐색.';
