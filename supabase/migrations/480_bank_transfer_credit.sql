-- ============================================================================
-- Migration 480: 크레딧 계좌이체(무통장입금) 충전
-- 적용일: 2026-07-22
-- ----------------------------------------------------------------------------
-- 배경:
--   PG(포트원/카카오페이) 심사에서 "유흥/플랫폼" 분류로 반려되는 상황 대비,
--   PG를 거치지 않고 사업용 계좌로 직접 입금받아 관리자가 수기 적립하는 경로 추가.
--
-- 플로우:
--   1) MD가 패키지 선택 + 입금자명 입력 → [입금하기]
--      → create_bank_transfer_request() 로 credit_payments(pending, method='bank_transfer') 생성
--      → AFTER INSERT 트리거가 관리자에게 딥링크 푸시 (/admin/credits?id=...)
--   2) MD가 사업용 계좌로 직접 송금 (한국 이체는 실시간)
--   3) 관리자는 카카오뱅크 입금알림으로 실입금 교차확인 후 [적립]
--      → 기존 confirm_credit_payment() 재사용 (멱등 적립, status='paid')
--      → AFTER UPDATE 트리거가 MD에게 "충전 완료" 푸시
--   ※ 오입금/미입금은 [반려] → 기존 fail_credit_payment('cancelled')
--
-- 설계 결정:
--   - 기존 credit_payments 테이블/적립 RPC를 그대로 재사용. method 컬럼으로 PG/계좌이체 구분.
--   - 관리자 푸시는 push-dispatch가 top-level 'url' 만 읽으므로(deep-link),
--     notify_admins_push(311)에 url이 없어 사용 불가 → url 포함 강제발송 함수를 신설.
--     Vault 인증 + per-admin EXCEPTION 래핑으로 발송 실패가 INSERT를 깨지 않게 함.
-- ============================================================================

-- 1) credit_payments 확장 ----------------------------------------------------
ALTER TABLE credit_payments
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'pg';

ALTER TABLE credit_payments
  DROP CONSTRAINT IF EXISTS credit_payments_method_check;
ALTER TABLE credit_payments
  ADD CONSTRAINT credit_payments_method_check
    CHECK (method IN ('pg', 'bank_transfer'));

ALTER TABLE credit_payments
  ADD COLUMN IF NOT EXISTS depositor_name TEXT;

COMMENT ON COLUMN credit_payments.method IS 'pg=포트원 카드/카카오페이, bank_transfer=계좌이체 수기적립';
COMMENT ON COLUMN credit_payments.depositor_name IS '계좌이체 시 MD가 입력한 입금자명(통장 대사용)';

-- 관리자 대기목록/처리 이력 조회 최적화
CREATE INDEX IF NOT EXISTS idx_credit_payments_bank_pending
  ON credit_payments(created_at DESC)
  WHERE method = 'bank_transfer' AND status = 'pending';

-- 관리자 조회 정책 (기존 "MD can read own"과 OR 결합).
-- admin 대시보드 대기 카운트/목록을 RLS 클라이언트로도 읽을 수 있게 함.
DROP POLICY IF EXISTS "Admins can read all credit payments" ON credit_payments;
CREATE POLICY "Admins can read all credit payments" ON credit_payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );


-- 2) 계좌이체 신청 생성 RPC (service_role 전용) ------------------------------
-- API Route 에서 productId 로 금액/크레딧을 재확정한 뒤 확정값을 넘겨 호출.
-- (클라이언트가 보낸 금액을 신뢰하지 않음 = create_credit_payment 와 동일 원칙)
CREATE OR REPLACE FUNCTION create_bank_transfer_request(
  p_md_id          UUID,
  p_payment_id     TEXT,
  p_product_id     TEXT,
  p_credits        INTEGER,
  p_amount         INTEGER,
  p_depositor_name TEXT
)
RETURNS credit_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row credit_payments;
BEGIN
  IF p_depositor_name IS NULL OR btrim(p_depositor_name) = '' THEN
    RAISE EXCEPTION '입금자명을 입력해주세요';
  END IF;

  INSERT INTO credit_payments (
    md_id, payment_id, product_id, credits, amount, method, depositor_name
  )
  VALUES (
    p_md_id, p_payment_id, p_product_id, p_credits, p_amount,
    'bank_transfer', btrim(p_depositor_name)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_bank_transfer_request(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_bank_transfer_request(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT)
  TO service_role;


-- 3) 관리자 딥링크 푸시 헬퍼 (url 포함, 강제발송) ---------------------------
-- notify_admins_push(311)은 top-level url 을 싣지 않아 클릭 딥링크가 안 걸린다.
-- push-dispatch(index.ts)는 payload 의 top-level 'url' 만 fcmData.url 로 전달하므로
-- url 을 실어 보내는 관리자 전용 발송 함수를 별도로 둔다. Vault 인증 사용.
CREATE OR REPLACE FUNCTION notify_admins_push_url(
  p_title TEXT,
  p_body  TEXT,
  p_url   TEXT,
  p_data  JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin            RECORD;
  v_supabase_url     TEXT;
  v_service_role_key TEXT;
  v_endpoint         TEXT;
BEGIN
  SELECT decrypted_secret INTO v_supabase_url     FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO v_service_role_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE NOTICE 'notify_admins_push_url: skipped (vault secrets missing)';
    RETURN;
  END IF;

  v_endpoint := v_supabase_url || '/functions/v1/push-dispatch';

  FOR v_admin IN
    SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := v_endpoint,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body    := jsonb_build_object(
          'user_id', v_admin.id::TEXT,
          'title',   p_title,
          'body',    p_body,
          'url',     p_url,
          'data',    p_data
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'notify_admins_push_url: post failed for admin %: %', v_admin.id, SQLERRM;
    END;
  END LOOP;
END;
$$;


-- 4) 신청 INSERT → 관리자 딥링크 푸시 트리거 --------------------------------
CREATE OR REPLACE FUNCTION notify_admin_bank_transfer_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.method = 'bank_transfer' AND NEW.status = 'pending' THEN
    PERFORM notify_admins_push_url(
      '💰 입금확인 요청',
      COALESCE(NEW.depositor_name, '입금자') || ' · '
        || NEW.credits || '크레딧 ('
        || to_char(NEW.amount, 'FM999,999,999') || '원)',
      '/admin/credits?id=' || NEW.id::TEXT,
      jsonb_build_object('type', 'credit_bank_transfer', 'payment_id', NEW.payment_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_bank_transfer ON credit_payments;
CREATE TRIGGER trg_notify_admin_bank_transfer
  AFTER INSERT ON credit_payments
  FOR EACH ROW EXECUTE FUNCTION notify_admin_bank_transfer_request();


-- 5) 적립 완료(UPDATE status→paid) → MD 충전완료 푸시 트리거 -----------------
-- 계좌이체 건에 한해 발송(PG 건은 결제 직후 클라이언트 토스트가 이미 안내).
CREATE OR REPLACE FUNCTION notify_md_bank_credit_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.method = 'bank_transfer'
     AND NEW.status = 'paid'
     AND COALESCE(OLD.status, '') <> 'paid' THEN
    PERFORM notify_user_push(
      NEW.md_id,
      '✅ 크레딧 충전 완료',
      NEW.credits || '크레딧이 충전되었습니다.',
      jsonb_build_object('type', 'credit_charged', 'payment_id', NEW.payment_id),
      '/md/credits',
      'transaction'   -- 미정의 카테고리 = can_send_push 에서 항상 허용(방해금지만 적용)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_md_bank_credit ON credit_payments;
CREATE TRIGGER trg_notify_md_bank_credit
  AFTER UPDATE ON credit_payments
  FOR EACH ROW EXECUTE FUNCTION notify_md_bank_credit_confirmed();
