-- 021: 거래별 정산 완료 시점 기록 (중복 정산 방지)
-- 목적: 같은 거래가 여러 정산 기간에 중복 포함되는 것을 방지

-- transactions 테이블에 정산 관련 필드 추가
ALTER TABLE transactions ADD COLUMN settled_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN settlement_log_id UUID REFERENCES settlement_logs(id);

-- settled_at 인덱스 (정산 쿼리 최적화)
CREATE INDEX idx_transactions_settled_at ON transactions(settled_at) WHERE settled_at IS NOT NULL;

-- 정산 가능한 거래만 조회하는 뷰
CREATE OR REPLACE VIEW settleable_transactions AS
SELECT
  t.id,
  t.auction_id,
  t.buyer_id,
  t.winning_price,
  t.payment_status,
  t.refund_status,
  t.no_show,
  t.confirmed_at,
  t.paid_at,
  t.settled_at,
  t.settlement_log_id,
  t.md_commission_rate,
  t.md_commission_amt,
  t.winning_price - t.md_commission_amt AS settlement_amt,
  a.md_id,
  a.title AS auction_title,
  a.event_date
FROM transactions t
JOIN auctions a ON a.id = t.auction_id
WHERE t.payment_status = 'paid'
  AND (t.refund_status IS NULL OR t.refund_status = 'none')  -- 환불 제외
  AND (t.no_show = false OR t.no_show IS NULL)               -- 노쇼 제외
  AND t.confirmed_at IS NOT NULL                             -- 미확인 제외
  AND t.settled_at IS NULL;                                  -- 미정산만

COMMENT ON VIEW settleable_transactions IS '정산 가능한 거래: 결제 완료 + 환불 없음 + 노쇼 없음 + 현장 확인 완료 + 미정산';

-- RPC 함수: 정산 완료 시 거래들의 settled_at 일괄 업데이트
CREATE OR REPLACE FUNCTION mark_transactions_settled(
  p_md_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_settlement_log_id UUID,
  p_settled_at TIMESTAMPTZ
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE transactions
  SET
    settled_at = p_settled_at,
    settlement_log_id = p_settlement_log_id
  FROM auctions a
  WHERE transactions.auction_id = a.id
    AND a.md_id = p_md_id
    AND transactions.payment_status = 'paid'
    AND (transactions.refund_status IS NULL OR transactions.refund_status = 'none')
    AND (transactions.no_show = false OR transactions.no_show IS NULL)
    AND transactions.confirmed_at IS NOT NULL
    AND transactions.settled_at IS NULL
    AND transactions.paid_at >= p_period_start
    AND transactions.paid_at <= (p_period_end::DATE + INTERVAL '1 day' - INTERVAL '1 second');
END;
$$;

COMMENT ON FUNCTION mark_transactions_settled IS '정산 완료 시 거래들의 settled_at 일괄 업데이트 (중복 정산 방지)';
