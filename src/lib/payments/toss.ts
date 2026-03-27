/**
 * 토스페이먼츠 서버 유틸리티
 * - confirmPayment: 결제 승인 (클라이언트 → 서버 콜백)
 * - cancelPayment: 결제 취소/환불
 *
 * @see https://docs.tosspayments.com/reference
 */

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
const TOSS_API_URL = "https://api.tosspayments.com/v1";

function getAuthHeader(): string {
  if (!TOSS_SECRET_KEY) {
    throw new Error("TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다");
  }
  return `Basic ${Buffer.from(`${TOSS_SECRET_KEY}:`).toString("base64")}`;
}

export interface TossPaymentResponse {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  method: string;
  approvedAt: string;
  card?: {
    company: string;
    number: string;
    installmentPlanMonths: number;
  };
}

export interface TossCancelResponse {
  paymentKey: string;
  orderId: string;
  status: string;
  cancels: Array<{
    cancelAmount: number;
    cancelReason: string;
    canceledAt: string;
  }>;
}

export interface TossError {
  code: string;
  message: string;
}

/**
 * 결제 승인
 * 클라이언트에서 토스 SDK로 결제 후, 서버에서 최종 승인
 */
export async function confirmPayment(
  paymentKey: string,
  orderId: string,
  amount: number
): Promise<TossPaymentResponse> {
  const res = await fetch(`${TOSS_API_URL}/payments/confirm`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });

  if (!res.ok) {
    const error: TossError = await res.json();
    throw new Error(`토스 결제 승인 실패: ${error.code} - ${error.message}`);
  }

  return res.json();
}

/**
 * 결제 취소 (전액 또는 부분)
 * amount 미지정 시 전액 취소
 */
export async function cancelPayment(
  paymentKey: string,
  cancelReason: string,
  cancelAmount?: number
): Promise<TossCancelResponse> {
  const body: Record<string, unknown> = { cancelReason };
  if (cancelAmount !== undefined) {
    body.cancelAmount = cancelAmount;
  }

  const res = await fetch(`${TOSS_API_URL}/payments/${paymentKey}/cancel`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error: TossError = await res.json();
    throw new Error(`토스 결제 취소 실패: ${error.code} - ${error.message}`);
  }

  return res.json();
}

/**
 * 결제 조회
 */
export async function getPayment(paymentKey: string): Promise<TossPaymentResponse> {
  const res = await fetch(`${TOSS_API_URL}/payments/${paymentKey}`, {
    method: "GET",
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  if (!res.ok) {
    const error: TossError = await res.json();
    throw new Error(`토스 결제 조회 실패: ${error.code} - ${error.message}`);
  }

  return res.json();
}
