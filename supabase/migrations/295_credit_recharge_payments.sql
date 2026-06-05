-- ============================================================================
-- Migration 295: 크레딧 유료 충전 결제 (PortOne 연동)
-- ----------------------------------------------------------------------------
-- 목적: MD가 카드/카카오페이로 크레딧을 구매(충전)하는 결제 기록 + 적립 RPC.
--
-- 설계 결정:
--  - 무료 일일 충전(recharge_md_credits)은 md_credits_max(120) 상한이 있으나,
--    유료로 구매한 크레딧은 "돈 주고 산 것"이므로 상한을 넘겨 적립한다.
--  - 결제 위변조 방지: 적립은 서버(Service Role)에서 PortOne 결제 검증을 통과한
--    뒤에만 호출. RPC 는 SECURITY DEFINER 로 두되 service_role 만 실행 허용.
--  - 멱등성: payment_id UNIQUE. 동일 결제 webhook/redirect 가 중복 들어와도
--    크레딧이 두 번 적립되지 않도록 보장.
-- ============================================================================

-- 1) 결제 기록 테이블 -------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- PortOne paymentId (가맹점이 생성, 전역 유일). 멱등 키.
  payment_id      TEXT NOT NULL UNIQUE,
  -- 상품 식별 (credit_39 / credit_99 / credit_149)
  product_id      TEXT NOT NULL,
  credits         INTEGER NOT NULL CHECK (credits > 0),
  amount          INTEGER NOT NULL CHECK (amount > 0),
  -- pending: 결제창 호출~검증 전, paid: 검증·적립 완료, failed: 실패, cancelled: 취소
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  -- PortOne 거래 고유번호 (검증 후 기록)
  pg_tx_id        TEXT,
  -- 적립 완료 여부 (멱등성 이중 가드)
  credited        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at         TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_payments_md ON credit_payments(md_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_status ON credit_payments(status);

ALTER TABLE credit_payments ENABLE ROW LEVEL SECURITY;

-- MD 는 자신의 결제 내역만 조회 가능 (쓰기는 서버 service_role 만)
DROP POLICY IF EXISTS "MD can read own credit payments" ON credit_payments;
CREATE POLICY "MD can read own credit payments" ON credit_payments
  FOR SELECT USING (auth.uid() = md_id);

-- updated_at 자동 갱신 트리거 (기존 update_updated_at 함수 재사용)
DROP TRIGGER IF EXISTS credit_payments_updated_at ON credit_payments;
CREATE TRIGGER credit_payments_updated_at
  BEFORE UPDATE ON credit_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- 2) 결제 의도 등록 (pending 생성) ------------------------------------------
-- 결제창 호출 직전에 호출. 클라이언트가 보낸 금액을 신뢰하지 않기 위해,
-- 서버에서 product_id 로 금액/크레딧을 재확정한 뒤 INSERT 하는 용도.
-- (실제 product→금액 매핑 검증은 API Route 에서 수행하고 여기엔 확정값을 받는다)
CREATE OR REPLACE FUNCTION create_credit_payment(
  p_md_id      UUID,
  p_payment_id TEXT,
  p_product_id TEXT,
  p_credits    INTEGER,
  p_amount     INTEGER
)
RETURNS credit_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row credit_payments;
BEGIN
  INSERT INTO credit_payments (md_id, payment_id, product_id, credits, amount)
  VALUES (p_md_id, p_payment_id, p_product_id, p_credits, p_amount)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


-- 3) 결제 확정 + 크레딧 적립 (멱등) -----------------------------------------
-- PortOne 결제 검증을 통과한 뒤에만 서버에서 호출.
-- 동일 payment_id 가 이미 credited=true 면 적립을 건너뛴다(멱등).
CREATE OR REPLACE FUNCTION confirm_credit_payment(
  p_payment_id TEXT,
  p_pg_tx_id   TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment credit_payments;
BEGIN
  -- 행 잠금: 동시 webhook/redirect 중복 처리 방지
  SELECT * INTO v_payment
  FROM credit_payments
  WHERE payment_id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'payment_not_found');
  END IF;

  -- 이미 적립 완료 → 멱등 성공 반환
  IF v_payment.credited THEN
    RETURN json_build_object('success', true, 'already_credited', true,
                             'credits', v_payment.credits);
  END IF;

  -- 크레딧 적립 (유료 충전은 md_credits_max 상한을 넘겨서 적립)
  UPDATE users
  SET md_credits = md_credits + v_payment.credits
  WHERE id = v_payment.md_id;

  -- 결제 상태 갱신
  UPDATE credit_payments
  SET status   = 'paid',
      pg_tx_id = p_pg_tx_id,
      credited = true,
      paid_at  = now()
  WHERE id = v_payment.id;

  RETURN json_build_object('success', true, 'already_credited', false,
                           'credits', v_payment.credits,
                           'md_id', v_payment.md_id);
END;
$$;


-- 4) 결제 실패/취소 처리 ----------------------------------------------------
CREATE OR REPLACE FUNCTION fail_credit_payment(
  p_payment_id TEXT,
  p_status     TEXT  -- 'failed' | 'cancelled'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE credit_payments
  SET status = p_status
  WHERE payment_id = p_payment_id
    AND credited = false;  -- 이미 적립된 결제는 건드리지 않음
END;
$$;


-- 5) 권한: service_role(서버) 만 쓰기 RPC 실행 ------------------------------
REVOKE EXECUTE ON FUNCTION create_credit_payment(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION confirm_credit_payment(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fail_credit_payment(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION create_credit_payment(UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION confirm_credit_payment(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION fail_credit_payment(TEXT, TEXT) TO service_role;
