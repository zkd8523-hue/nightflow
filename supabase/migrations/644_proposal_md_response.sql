-- ============================================================================
-- Migration 644: MD 제안서 응답 (foreign_requests)
--
-- 배경: 운영자가 MD에게 "이 조건 되냐"를 카톡으로 묻고, 답을 받아 머릿속·카톡에만
--      남겼다. 시스템에는 그 응답을 담을 자리가 없어서 "누가 승인했는지 / 왜
--      거절됐는지 / 얼마가 부족한지"가 전부 흩어졌다.
--
-- 제안서(/booking/proposal/{request_id})에서 MD가 직접 누르면 여기 쌓인다.
-- 확정서(booking_confirmations)와는 다른 단계다 — 이건 "합의 이전", 확정서는
-- "합의 이후 발행물". 그래서 booking_confirmations가 아니라 요청 쪽에 붙인다.
-- ============================================================================

ALTER TABLE foreign_requests
  ADD COLUMN IF NOT EXISTS md_response TEXT
    CHECK (md_response IS NULL OR md_response IN ('approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS md_responded_at TIMESTAMPTZ,

  -- 승인 시 —
  -- 손님이 테이블을 고를 수 있는지. NULL = 미응답, true = 고를 수 있음(선택지를
  -- md_table_options에 적어줌), false = 랜덤/당일배정.
  ADD COLUMN IF NOT EXISTS md_table_choosable BOOLEAN,
  -- 고를 수 있을 때 MD가 적어준 선택지(자유 텍스트). 예: "A존 3번 / B존 5번 중 선택"
  ADD COLUMN IF NOT EXISTS md_table_options TEXT,

  -- 거절 시 —
  -- 'budget'(금액 부족) | 'absent'(당일 미출근) | 'expired'(예약 만료)
  ADD COLUMN IF NOT EXISTS md_reject_reason TEXT
    CHECK (md_reject_reason IS NULL OR md_reject_reason IN ('budget', 'absent', 'expired')),
  -- 금액 부족일 때 "얼마면 되는지". 이게 있어야 운영자가 손님에게 바로 되물을 수 있다.
  ADD COLUMN IF NOT EXISTS md_required_amount INTEGER
    CHECK (md_required_amount IS NULL OR md_required_amount > 0);

COMMENT ON COLUMN foreign_requests.md_response IS
  'MD가 제안서에서 누른 응답. NULL이면 아직 회신 없음.';
COMMENT ON COLUMN foreign_requests.md_table_choosable IS
  '승인 시 손님이 테이블을 고를 수 있는지. false면 랜덤/당일배정.';
COMMENT ON COLUMN foreign_requests.md_table_options IS
  '손님이 고를 수 있을 때 MD가 적어준 선택지(자유 텍스트).';
COMMENT ON COLUMN foreign_requests.md_reject_reason IS
  '거절 사유. budget=금액부족 / absent=당일미출근 / expired=예약만료.';
COMMENT ON COLUMN foreign_requests.md_required_amount IS
  '금액 부족 거절 시 MD가 제시한 필요 금액(원).';
