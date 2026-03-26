-- Migration 072: 회원탈퇴 보안 패치
-- 날짜: 2026-03-16
-- 검토 결과 발견된 6개 문제 수정

-- ============================================================
-- (a) place_bid(): deleted_at 체크 추가
-- ============================================================
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

  -- 7. 차단/탈퇴 유저 검증 (★ deleted_at 체크 추가)
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = p_bidder_id
    AND (is_blocked = true
      OR (blocked_until IS NOT NULL AND blocked_until > now())
      OR deleted_at IS NOT NULL)
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

COMMENT ON FUNCTION place_bid(UUID, UUID, INTEGER) IS 'Migration 072: 070 기반 + deleted_at 탈퇴 유저 입찰 차단';

-- ============================================================
-- (b) soft_delete_user(): active bids 취소 추가
-- ============================================================
CREATE OR REPLACE FUNCTION soft_delete_user(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
  v_active_count INTEGER;
  v_won_count INTEGER;
BEGIN
  -- 1. 유저 조회 + 락
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_user IS NULL THEN
    RAISE EXCEPTION '사용자를 찾을 수 없습니다';
  END IF;

  -- 이미 탈퇴 처리된 경우
  IF v_user.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION '이미 탈퇴 처리된 계정입니다';
  END IF;

  -- 2. Admin 차단
  IF v_user.role = 'admin' THEN
    RAISE EXCEPTION '관리자 계정은 탈퇴할 수 없습니다';
  END IF;

  -- 3. MD 활성 경매 체크
  IF v_user.role = 'md' THEN
    SELECT COUNT(*) INTO v_active_count
    FROM auctions
    WHERE md_id = p_user_id
      AND status IN ('active', 'scheduled', 'won', 'contacted');

    IF v_active_count > 0 THEN
      RAISE EXCEPTION '활성 경매 %건이 있어 탈퇴할 수 없습니다', v_active_count;
    END IF;
  END IF;

  -- 4. 진행 중인 낙찰 체크
  SELECT COUNT(*) INTO v_won_count
  FROM auctions
  WHERE winner_id = p_user_id
    AND status IN ('won', 'contacted');

  IF v_won_count > 0 THEN
    RAISE EXCEPTION '진행 중인 낙찰 %건이 있어 탈퇴할 수 없습니다', v_won_count;
  END IF;

  -- 5. ★ Active bids 취소 (탈퇴 유저가 최고 입찰자인 경매 보호)
  UPDATE bids SET status = 'cancelled'
  WHERE bidder_id = p_user_id AND status = 'active';

  -- 6. Soft Delete
  UPDATE users SET deleted_at = now() WHERE id = p_user_id;

  -- 7. 제재 기록이 있으면 블랙리스트에 저장
  IF v_user.kakao_id IS NOT NULL AND (
    v_user.strike_count > 0 OR
    v_user.warning_count > 0 OR
    v_user.is_blocked OR
    v_user.blocked_until IS NOT NULL
  ) THEN
    INSERT INTO deleted_user_penalties (
      kakao_id, strike_count, warning_count, is_blocked, blocked_until
    ) VALUES (
      v_user.kakao_id,
      COALESCE(v_user.strike_count, 0),
      COALESCE(v_user.warning_count, 0),
      COALESCE(v_user.is_blocked, false),
      v_user.blocked_until
    )
    ON CONFLICT (kakao_id) DO UPDATE SET
      strike_count = EXCLUDED.strike_count,
      warning_count = EXCLUDED.warning_count,
      is_blocked = EXCLUDED.is_blocked,
      blocked_until = EXCLUDED.blocked_until,
      deleted_at = now();
  END IF;

  RETURN json_build_object(
    'success', true,
    'user_id', p_user_id,
    'deleted_at', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION soft_delete_user(UUID) IS 'Migration 072: active bids 취소 추가. 탈퇴 유저 최고 입찰 방지.';

-- ============================================================
-- (c) delete_user_account(): 누락 FK 정리 추가
-- ============================================================
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- 1. 유저 조회 + 락
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_user IS NULL THEN
    RAISE EXCEPTION '사용자를 찾을 수 없습니다';
  END IF;

  -- deleted_at이 30일 이상 경과했는지 확인
  IF v_user.deleted_at IS NULL THEN
    RAISE EXCEPTION '탈퇴 처리되지 않은 계정입니다';
  END IF;

  IF v_user.deleted_at > now() - interval '30 days' THEN
    RAISE EXCEPTION '30일 유예 기간이 아직 남아있습니다';
  END IF;

  -- 2. nullable FK SET NULL
  UPDATE auctions SET winner_id = NULL WHERE winner_id = p_user_id;
  UPDATE auctions SET fallback_from_winner_id = NULL WHERE fallback_from_winner_id = p_user_id;
  UPDATE transactions SET confirmed_by = NULL WHERE confirmed_by = p_user_id;
  UPDATE transactions SET referrer_md_id = NULL WHERE referrer_md_id = p_user_id;
  UPDATE notification_logs SET recipient_user_id = NULL WHERE recipient_user_id = p_user_id;
  UPDATE settlement_logs SET admin_id = NULL WHERE admin_id = p_user_id;
  UPDATE bank_verifications SET verified_by = NULL WHERE verified_by = p_user_id;

  -- 3. NOT NULL FK rows DELETE (CASCADE가 없는 것들)
  DELETE FROM bids WHERE bidder_id = p_user_id;
  DELETE FROM md_sanctions WHERE admin_id = p_user_id;
  -- MD 경매에 연결된 다른 유저의 bids/transactions 먼저 정리
  DELETE FROM bids WHERE auction_id IN (SELECT id FROM auctions WHERE md_id = p_user_id);
  DELETE FROM transactions WHERE auction_id IN (SELECT id FROM auctions WHERE md_id = p_user_id);
  DELETE FROM transactions WHERE buyer_id = p_user_id;
  DELETE FROM transactions WHERE md_id = p_user_id;
  DELETE FROM auctions WHERE md_id = p_user_id;
  DELETE FROM settlement_logs WHERE md_id = p_user_id;
  DELETE FROM bank_verifications WHERE md_id = p_user_id;

  -- 4. DELETE user (CASCADE handles remaining tables)
  DELETE FROM users WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'deleted_user_id', p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION delete_user_account(UUID) IS 'Migration 072: 누락 FK 정리 추가 (md_sanctions, settlement_logs.admin_id, bank_verifications.verified_by)';

-- ============================================================
-- (d) deleted_user_penalties RLS 활성화
-- ============================================================
ALTER TABLE deleted_user_penalties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read penalties" ON deleted_user_penalties
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 코멘트
-- ============================================================
COMMENT ON TABLE deleted_user_penalties IS '탈퇴 유저 제재 블랙리스트. RLS 활성화: Admin만 조회, SECURITY DEFINER 함수만 쓰기.';
