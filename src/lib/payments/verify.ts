// 서버 전용 모듈: SUPABASE_SERVICE_ROLE_KEY / PORTONE_V2_API_SECRET 사용.
// 클라이언트 컴포넌트에서 import 금지 (API Route / Server Component 에서만).
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 포트원 V2 결제 검증 + 크레딧 적립 (서버 전용).
 *
 * 흐름:
 *  1) 우리 DB 의 credit_payments(payment_id) 로 기대 금액을 가져온다.
 *  2) 포트원 API 로 실제 결제 내역을 조회한다.
 *  3) status === 'PAID' && 실제 결제금액 === 기대 금액 이면 confirm_credit_payment RPC
 *     로 적립(멱등). 금액 불일치/미결제면 거절.
 *
 * 멱등성: confirm_credit_payment 가 credited=true 면 재적립하지 않으므로,
 * 결제창 redirect / webhook / 클라이언트 verify 가 동시에 들어와도 안전.
 */
export async function verifyAndCreditPayment(
  paymentId: string
): Promise<{ success: boolean; credits?: number; error?: string }> {
  const apiSecret = process.env.PORTONE_V2_API_SECRET;
  if (!apiSecret) {
    return { success: false, error: "결제 설정 오류 (API secret 없음)" };
  }

  const admin = createAdminClient();

  // 1) 우리가 만든 결제 의도 조회 (기대 금액의 신뢰 출처)
  const { data: payment, error: pErr } = await admin
    .from("credit_payments")
    .select("*")
    .eq("payment_id", paymentId)
    .single();

  if (pErr || !payment) {
    return { success: false, error: "결제 내역을 찾을 수 없습니다." };
  }

  // 이미 적립된 결제면 멱등 성공
  if (payment.credited) {
    return { success: true, credits: payment.credits };
  }

  // 2) 포트원 결제 단건 조회
  let pgPayment: {
    status?: string;
    amount?: { total?: number };
    id?: string;
  };
  try {
    const res = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `PortOne ${apiSecret}` } }
    );
    if (!res.ok) {
      return { success: false, error: "결제사 조회에 실패했습니다." };
    }
    pgPayment = await res.json();
  } catch {
    return { success: false, error: "결제사 통신 오류" };
  }

  // 3) 상태/금액 위변조 검증
  if (pgPayment.status !== "PAID") {
    await admin.rpc("fail_credit_payment", {
      p_payment_id: paymentId,
      p_status: "failed",
    });
    return { success: false, error: "결제가 완료되지 않았습니다." };
  }

  const paidAmount = pgPayment.amount?.total;
  if (paidAmount !== payment.amount) {
    // 금액 불일치 = 위변조 시도. 적립 거부.
    await admin.rpc("fail_credit_payment", {
      p_payment_id: paymentId,
      p_status: "failed",
    });
    return { success: false, error: "결제 금액이 일치하지 않습니다." };
  }

  // 4) 적립 (멱등 RPC)
  const { data: confirm, error: cErr } = await admin.rpc(
    "confirm_credit_payment",
    { p_payment_id: paymentId, p_pg_tx_id: pgPayment.id ?? paymentId }
  );

  if (cErr || !confirm?.success) {
    return { success: false, error: "크레딧 적립에 실패했습니다." };
  }

  return { success: true, credits: confirm.credits };
}
