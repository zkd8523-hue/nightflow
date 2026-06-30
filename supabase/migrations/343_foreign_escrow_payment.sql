-- Migration 343: 외국인 깃발 매칭 시 Stripe Escrow 결제 시스템
--
-- 모델 (확정):
-- - 외국인 식별: users.lang IN ('en','zh','ja') 자동
-- - 결제: 100% 선결제 (Stripe Payment Intent)
-- - 마진: NightFlow 9% (Stripe 수수료 우리 흡수)
-- - 환불: 48h 100% / 24h 50% / 0% (노쇼 포함)
-- - 정산: MD 방문 확인 또는 24h 자동 → 91% 송금
--
-- 비즈니스: Model B 외국인 한정 Hybrid (한국인 = Model B 그대로 유지)

-- ============================================================
-- 1. users 테이블 확장 (Stripe 식별자)
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;  -- MD가 Stripe Connect 가입 시

COMMENT ON COLUMN users.stripe_customer_id IS '외국인 사용자 Stripe Customer ID (결제 시 자동 생성)';
COMMENT ON COLUMN users.stripe_connect_account_id IS 'MD가 Stripe Connect Express 가입 시 ID (외국인 매칭 정산용)';

-- ============================================================
-- 2. payment_escrow 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 거래 참조 (깃발 매칭 puzzle_offer 또는 경매 auction)
  puzzle_offer_id UUID REFERENCES puzzle_offers(id) ON DELETE SET NULL,
  auction_id UUID REFERENCES auctions(id) ON DELETE SET NULL,

  -- 거래 당사자
  user_id UUID NOT NULL REFERENCES users(id),     -- 외국인 결제자
  md_id UUID NOT NULL REFERENCES users(id),       -- 정산 받는 MD
  club_id UUID REFERENCES clubs(id),

  -- 금액 (KRW)
  amount_total INTEGER NOT NULL,                  -- 사용자 결제 총액 = 깃발 금액
  amount_platform_fee INTEGER NOT NULL,           -- NightFlow 9% 마진
  amount_stripe_fee INTEGER NOT NULL,             -- Stripe 수수료 (우리 흡수, 환불 시 손실)
  amount_md_settlement INTEGER NOT NULL,          -- MD 송금 예정액 = amount_total - amount_platform_fee
  amount_refunded INTEGER NOT NULL DEFAULT 0,     -- 누적 환불액

  -- Stripe IDs
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT,
  stripe_transfer_id TEXT,                        -- MD 송금 transfer
  stripe_refund_ids TEXT[] DEFAULT '{}',          -- 환불 ID 누적

  -- 상태 관리
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- 사용자 결제 진행 중
    'paid',              -- 결제 완료, Escrow 보관 중
    'visit_confirmed',   -- MD가 방문 확인 (정산 대기)
    'settled',           -- MD 송금 완료
    'cancelled_refunded',-- 취소 환불 완료
    'no_show',           -- 노쇼 (NightFlow 100% 수익)
    'failed'             -- 결제 실패
  )),

  -- 시간 추적
  event_at TIMESTAMPTZ NOT NULL,                  -- 깃발 이벤트 일시 (환불 정책 기준)
  paid_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,                       -- MD 방문 확인 시점
  settled_at TIMESTAMPTZ,                         -- MD 송금 시점
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 메타
  user_lang TEXT,                                  -- 결제 시 사용자 언어 (en/zh/ja)
  user_country_code TEXT                           -- 카드 발급 국가 (Stripe metadata)
);

CREATE INDEX idx_escrow_user ON payment_escrow(user_id);
CREATE INDEX idx_escrow_md ON payment_escrow(md_id);
CREATE INDEX idx_escrow_status ON payment_escrow(status);
CREATE INDEX idx_escrow_event_at ON payment_escrow(event_at);
CREATE INDEX idx_escrow_stripe_pi ON payment_escrow(stripe_payment_intent_id);
CREATE INDEX idx_escrow_puzzle_offer ON payment_escrow(puzzle_offer_id) WHERE puzzle_offer_id IS NOT NULL;

-- updated_at 자동 업데이트
CREATE TRIGGER trg_escrow_updated_at
  BEFORE UPDATE ON payment_escrow
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. RLS 정책
-- ============================================================

ALTER TABLE payment_escrow ENABLE ROW LEVEL SECURITY;

-- 본인 결제 조회
CREATE POLICY "User can view own escrow"
  ON payment_escrow FOR SELECT
  USING (auth.uid() = user_id);

-- MD가 자기 정산 조회
CREATE POLICY "MD can view own settlements"
  ON payment_escrow FOR SELECT
  USING (auth.uid() = md_id);

-- Admin 전체 조회
CREATE POLICY "Admin can view all escrow"
  ON payment_escrow FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- INSERT/UPDATE는 service_role 또는 RPC 함수만 (Stripe Webhook에서)
-- 직접 INSERT/UPDATE 차단 (보안)

-- ============================================================
-- 4. 환불 정책 계산 함수
-- ============================================================

-- 환불률 계산: event_at 기준 현재 시점 환불 정책 적용
CREATE OR REPLACE FUNCTION calculate_refund_rate(p_event_at TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
  v_hours_before NUMERIC;
BEGIN
  v_hours_before := EXTRACT(EPOCH FROM (p_event_at - now())) / 3600;

  IF v_hours_before >= 48 THEN
    RETURN 100;  -- 48시간 전: 100% 환불
  ELSIF v_hours_before >= 24 THEN
    RETURN 50;   -- 24~48시간 전: 50% 환불
  ELSE
    RETURN 0;    -- 24시간 이내 / 노쇼: 0% 환불
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_refund_rate IS '외국인 결제 취소 시 환불률 계산 (이벤트 시점 기준)';

-- ============================================================
-- 5. MD 정산 자동화 함수 (24시간 후 자동 확정)
-- ============================================================

CREATE OR REPLACE FUNCTION auto_confirm_visits()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 이벤트 후 24시간 지났고 MD가 수동 확인 안 했으면 자동 확정
  UPDATE payment_escrow
  SET
    status = 'visit_confirmed',
    confirmed_at = now()
  WHERE
    status = 'paid'
    AND event_at < (now() - INTERVAL '24 hours')
    AND confirmed_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_confirm_visits IS 'Cron: 이벤트 후 24h 경과 시 자동 방문 확정 (MD 수동 확인 없을 때)';

-- ============================================================
-- 6. 외국인 사용자 체크 헬퍼
-- ============================================================

CREATE OR REPLACE FUNCTION is_foreign_user(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_lang TEXT;
BEGIN
  SELECT lang INTO v_lang FROM users WHERE id = p_user_id;
  RETURN v_lang IN ('en', 'zh', 'ja');
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_foreign_user IS '외국인 사용자 여부 (lang 기반) — Escrow 결제 트리거에 사용';

-- ============================================================
-- 7. 통계 뷰 (MD 대시보드용)
-- ============================================================

CREATE OR REPLACE VIEW md_foreign_settlement_stats AS
SELECT
  md_id,
  COUNT(*) AS total_matches,
  COUNT(*) FILTER (WHERE status = 'settled') AS settled_count,
  COUNT(*) FILTER (WHERE status = 'no_show') AS no_show_count,
  COUNT(*) FILTER (WHERE status = 'cancelled_refunded') AS cancelled_count,
  COALESCE(SUM(amount_md_settlement) FILTER (WHERE status = 'settled'), 0) AS total_settled_amount,
  COALESCE(SUM(amount_total) FILTER (WHERE status IN ('paid','visit_confirmed')), 0) AS pending_settlement
FROM payment_escrow
GROUP BY md_id;

COMMENT ON VIEW md_foreign_settlement_stats IS 'MD 대시보드용 외국인 매칭 정산 통계';

-- ============================================================
-- 종료 — 적용 후 다음 단계:
-- 1. Stripe Korea 가입 → API Key 환경변수 설정
-- 2. lib/payments/stripe.ts 작성
-- 3. /api/payments/* 라우트 작성
-- 4. /zh /en /ja 결제 페이지 작성
-- 5. Cron: auto_confirm_visits() 매시간 호출
-- ============================================================
