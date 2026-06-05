import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAndCreditPayment } from "@/lib/payments/verify";

/**
 * 결제 검증 + 크레딧 적립.
 * 결제창 종료 후 클라이언트가 호출. 실제 검증/적립은 verifyAndCreditPayment 가
 * 포트원 API 로 금액·상태를 대조한 뒤 멱등 적립한다.
 */
export async function POST(req: Request) {
  try {
    const { paymentId } = await req.json();
    if (!paymentId || typeof paymentId !== "string") {
      return NextResponse.json({ error: "paymentId 누락" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const result = await verifyAndCreditPayment(paymentId);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, credits: result.credits });
  } catch {
    return NextResponse.json(
      { success: false, error: "결제 검증 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
