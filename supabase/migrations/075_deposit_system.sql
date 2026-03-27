-- ============================================================================
-- Migration 075: 보증금(Deposit) 시스템
-- 날짜: 2026-03-27
-- 설명: MD 선택형 보증금 결제 (토스페이먼츠 PG 연동)
--   - deposits 테이블 생성
--   - auctions/auction_templates 확장 (deposit_required, deposit_amount)
--   - check_deposit_status() RPC 함수
--   - place_bid() 보증금 검증 추가
-- ============================================================================

-- ================================
-- 1. deposits 테이블
-- ================================
CREATE TABLE deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  md_id UUID NOT NULL REFERENCES users(id),

  -- 금액
  amount INTEGER NOT NULL DEFAULT 30000,

  -- 토스페이먼츠 결제 정보
  payment_key TEXT UNIQUE,          -- 토스 paymentKey
  order_id TEXT UNIQUE NOT NULL,    -- 우리 주문번호
  payment_method TEXT,              -- card 등

  -- 상태
  -- pending: 결제 요청 생성 (토스 SDK 호출 전)
  -- paid: 결제 완료 (토스 confirm 성공)
  -- held: 낙찰자 보증금 확정
  -- refunded: 환불 완료 (미낙찰/취소/유찰)
  -- forfeited: 몰수 (노쇼)
  -- settled: MD 정산 완료
  -- failed: 결제 실패
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','held','refunded','forfeited','settled','failed')),

  -- 상태 전이 시각
  paid_at TIMESTAMPTZ,
  held_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  forfeited_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,

  -- 환불 정보
  refund_amount INTEGER,
  refund_reason TEXT,

  -- 정산 연결
  settlement_id UUID REFERENCES settlement_logs(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_deposits_auction ON deposits(auction_id);
CREATE INDEX idx_deposits_user ON deposits(user_id);
CREATE INDEX idx_deposits_md ON deposits(md_id);
CREATE INDEX idx_deposits_status ON deposits(status);
CREATE INDEX idx_deposits_order ON deposits(order_id);

-- 중복 결제 방지: 같은 경매+유저에 활성 보증금은 1개만
CREATE UNIQUE INDEX idx_deposits_unique_active
  ON deposits(auction_id, user_id)
  WHERE status NOT IN ('failed', 'refunded');

-- RLS
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;

-- 유저: 본인 보증금 조회
CREATE POLICY "Users can view own deposits" ON deposits
  FOR SELECT USING (auth.uid() = user_id);

-- MD: 본인 경매의 보증금 조회
CREATE POLICY "MD can view auction deposits" ON deposits
  FOR SELECT USING (auth.uid() = md_id);

-- Admin: 전체 관리
CREATE POLICY "Admin full access deposits" ON deposits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role (API routes)에서 INSERT/UPDATE 허용
-- Note: API routes는 supabaseAdmin(service role)으로 접근하므로 RLS 우회

-- updated_at 자동 갱신
CREATE TRIGGER deposits_updated_at
  BEFORE UPDATE ON deposits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================
-- 2. auctions 테이블 확장
-- ================================
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS deposit_amount INTEGER DEFAULT 30000;

-- ================================
-- 3. auction_templates 확장
-- ================================
ALTER TABLE auction_templates ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN NOT NULL DEFAULT false;

-- ================================
-- 4. check_deposit_status() RPC 함수
-- ================================
CREATE OR REPLACE FUNCTION check_deposit_status(
  p_auction_id UUID,
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  v_auction RECORD;
  v_deposit RECORD;
BEGIN
  -- 경매 보증금 설정 확인
  SELECT deposit_required, deposit_amount
  INTO v_auction
  FROM auctions WHERE id = p_auction_id;

  IF v_auction IS NULL THEN
    RETURN json_build_object('error', 'auction_not_found');
  END IF;

  -- 보증금 불필요
  IF NOT v_auction.deposit_required THEN
    RETURN json_build_object(
      'required', false,
      'status', 'not_required'
    );
  END IF;

  -- 활성 보증금 확인
  SELECT id, status, amount, paid_at
  INTO v_deposit
  FROM deposits
  WHERE auction_id = p_auction_id
    AND user_id = p_user_id
    AND status IN ('paid', 'held')
  LIMIT 1;

  IF v_deposit IS NOT NULL THEN
    RETURN json_build_object(
      'required', true,
      'status', v_deposit.status,
      'deposit_id', v_deposit.id,
      'amount', v_deposit.amount,
      'paid', true
    );
  END IF;

  -- 미결제
  RETURN json_build_object(
    'required', true,
    'status', 'unpaid',
    'amount', v_auction.deposit_amount,
    'paid', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_deposit_status(UUID, UUID) IS
  'Migration 075: 보증금 결제 상태 확인 (required/paid/unpaid)';

-- ================================
-- 5. place_bid() 보증금 검증 추가
-- ================================
-- 기존 070 기반 + 보증금 검증(Step 4.5 삽입)
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

  -- ★ 4.5. 보증금 검증 (Migration 075 추가)
  IF v_auction.deposit_required THEN
    IF NOT EXISTS (
      SELECT 1 FROM deposits
      WHERE auction_id = p_auction_id
        AND user_id = p_bidder_id
        AND status IN ('paid', 'held')
    ) THEN
      RETURN json_build_object('success', false, 'error', 'deposit_required');
    END IF;
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

    -- BIN 낙찰 시 보증금 held 전환 (Migration 075)
    IF v_auction.deposit_required THEN
      UPDATE deposits SET status = 'held', held_at = now()
      WHERE auction_id = p_auction_id AND user_id = p_bidder_id AND status = 'paid';
    END IF;

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
  'Migration 075: 070 기반 + 보증금 검증(4.5단계) + BIN 낙찰 시 보증금 held 전환';
