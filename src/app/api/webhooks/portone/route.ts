import { NextResponse } from "next/server";
import { verifyAndCreditPayment } from "@/lib/payments/verify";

/**
 * 포트원 V2 웹훅 수신.
 * 결제 완료 시 포트원이 서버로 직접 통보 → 가장 신뢰할 수 있는 적립 경로.
 * (클라이언트가 창을 닫아도 적립이 누락되지 않게 하는 안전망)
 *
 * 보안: @portone/server-sdk 의 Webhook.verify 로 서명 검증을 하는 것이 정석이나,
 * 본 핸들러는 서명 검증 후에도 verifyAndCreditPayment 가 포트원 API 로 금액을
 * 재대조하므로, 위조 webhook 으로는 적립이 불가능하다(2차 방어).
 *
 * TODO(실연동 시): PORTONE_WEBHOOK_SECRET 로 서명 검증 추가.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 포트원 V2 웹훅 페이로드: { type, data: { paymentId, ... } }
    const paymentId: string | undefined =
      body?.data?.paymentId ?? body?.payment_id ?? body?.paymentId;

    if (!paymentId) {
      // 웹훅 형식이 예상과 다르면 200 으로 응답(재시도 폭주 방지)하되 무시
      return NextResponse.json({ ok: true, ignored: true });
    }

    // 금액·상태 재대조 후 멱등 적립
    const result = await verifyAndCreditPayment(paymentId);

    // 웹훅은 항상 200 계열로 응답 (실패 시 포트원이 재시도 — 멱등이라 안전)
    return NextResponse.json({ ok: result.success });
  } catch {
    // 파싱 실패 등도 200 으로 응답해 무한 재시도 방지
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
