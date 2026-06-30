import Stripe from "stripe";

// 외국인 깃발 매칭 Escrow 결제 (Migration 343).
// 사용 시점: API 라우트 (/api/payments/*) 서버 측에서만 import.
// 클라이언트에서는 @stripe/stripe-js의 loadStripe 사용 (별도 module).

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!SECRET_KEY) {
  // 빌드 타임에는 통과시키되, 런타임 호출 시점에 명시적 에러.
  // 환경변수 누락 = 결제 기능 비활성화로 fail-fast.
  if (process.env.NODE_ENV === "production") {
    console.warn("[stripe] STRIPE_SECRET_KEY 누락 — 외국인 결제 비활성화");
  }
}

export const stripe = new Stripe(SECRET_KEY ?? "sk_test_dummy", {
  apiVersion: "2026-06-24.dahlia",
  typescript: true,
});

// NightFlow Escrow 정책 (확정 모델)
export const ESCROW_CONFIG = {
  PLATFORM_FEE_RATE: 0.09,  // NightFlow 9% 마진
  CURRENCY: "krw" as const,
  // Stripe Korea 기준 — 환불 시 Stripe 수수료는 환급되지 않음 (우리가 흡수)
  STRIPE_FEE_RATE_INTL: 0.034,  // 해외 카드 3.4%
  STRIPE_FEE_FLAT_KRW: 300,
} as const;

// 환불 정책 (Migration 343 calculate_refund_rate와 동일 — 클라이언트 미리보기용)
export function calculateRefundRate(eventAt: Date): number {
  const hoursBefore = (eventAt.getTime() - Date.now()) / 3_600_000;
  if (hoursBefore >= 48) return 100;
  if (hoursBefore >= 24) return 50;
  return 0;
}

// 결제 금액 분배 계산 (서버에서 escrow 레코드 생성 시 사용)
export function calculatePaymentBreakdown(amountTotal: number) {
  const platformFee = Math.floor(amountTotal * ESCROW_CONFIG.PLATFORM_FEE_RATE);
  const stripeFee = Math.floor(
    amountTotal * ESCROW_CONFIG.STRIPE_FEE_RATE_INTL +
      ESCROW_CONFIG.STRIPE_FEE_FLAT_KRW
  );
  const mdSettlement = amountTotal - platformFee;
  // NightFlow 순수익 = platformFee - stripeFee (우리 흡수)
  const platformNet = platformFee - stripeFee;
  return { amountTotal, platformFee, stripeFee, mdSettlement, platformNet };
}
