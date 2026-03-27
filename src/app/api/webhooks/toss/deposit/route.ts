import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// 토스페이먼츠 웹훅 → 결제 상태 동기화
// https://docs.tosspayments.com/guides/webhook
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { eventType, data } = body;

    const supabaseAdmin = createAdminClient();

    switch (eventType) {
      case "PAYMENT_STATUS_CHANGED": {
        const { paymentKey, status } = data;
        if (!paymentKey) break;

        // 결제 취소 웹훅 (토스 관리자 페이지에서 직접 취소한 경우)
        if (status === "CANCELED" || status === "PARTIAL_CANCELED") {
          await supabaseAdmin
            .from("deposits")
            .update({
              status: "refunded",
              refunded_at: new Date().toISOString(),
              refund_reason: "토스 웹훅 취소",
            })
            .eq("payment_key", paymentKey)
            .in("status", ["paid", "held"]);
        }
        break;
      }

      default:
        // 알 수 없는 이벤트 무시
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Webhook toss/deposit] Error:", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
