-- ============================================================================
-- Migration 296: 무료 자동 크레딧 충전 중단 (유료 충전 전환)
-- ============================================================================
-- 배경: Migration 295 로 유료 크레딧 충전(포트원/카카오페이)이 도입됨.
--       무료로 매일 +60 크레딧을 계속 지급하면 유료 충전 수요가 사라지므로,
--       매일 06:00 KST 자동 크레딧 지급을 중단한다.
--
-- ⚠️ 주의: recharge_md_credits() 는 "크레딧 충전" + "일일 오퍼 카운터 초기화"
--          두 가지를 함께 수행한다. 카운터 초기화(md_daily_offers_count = 0)는
--          MD 하루 오퍼 제한을 매일 푸는 필수 로직이므로 반드시 유지한다.
--          → 함수 본문에서 "크레딧 +60 UPDATE" 만 제거하고 카운터 초기화는 남긴다.
--          → pg_cron 잡은 그대로 유지(매일 06:00 KST 카운터 리셋 목적).
--
-- 기존 무료 크레딧 잔액은 회수하지 않는다(그대로 사용 가능).
-- ============================================================================

-- recharge_md_credits() 재정의: 크레딧 지급 제거, 일일 오퍼 카운터 초기화만 유지
CREATE OR REPLACE FUNCTION recharge_md_credits()
RETURNS void AS $$
BEGIN
  -- 일일 오퍼 카운터 초기화 (KST 기준) — 하루 오퍼 제한을 매일 리셋하는 필수 로직
  UPDATE users
  SET
    md_daily_offers_count = 0,
    md_daily_offers_reset_at = (now() AT TIME ZONE 'Asia/Seoul')::DATE
  WHERE role = 'md';

  -- (제거됨) 무료 크레딧 +60 자동 지급
  --   유료 충전(295) 전환에 따라 매일 자동 지급 중단.
  --   기존 보유 크레딧은 유지되며, 충전은 /md/credits 유료 결제로만 가능.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION recharge_md_credits() IS
  '매일 06:00 KST pg_cron 호출: MD 일일 오퍼 카운터만 초기화 (무료 크레딧 지급은 296에서 중단)';
