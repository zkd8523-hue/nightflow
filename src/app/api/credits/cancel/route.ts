import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 결제창에서 사용자가 취소/실패한 결제를 cancelled 로 기록.
 * (적립된 결제는 fail_credit_payment 가 건드리지 않으므로 안전)
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

    const admin = createAdminClient();
    await admin.rpc("fail_credit_payment", {
      p_payment_id: paymentId,
      p_status: "cancelled",
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "오류가 발생했습니다." }, { status: 500 });
  }
}
