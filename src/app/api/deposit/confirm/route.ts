import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { confirmPayment } from "@/lib/payments/toss";
import { NextResponse } from "next/server";

// 토스 결제 승인 콜백 → deposits pending → paid
export async function POST(req: Request) {
  try {
    const { paymentKey, orderId, amount } = await req.json();

    if (!paymentKey || !orderId || !amount) {
      return NextResponse.json(
        { error: "Missing paymentKey, orderId, or amount" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // 1. deposits 레코드 조회 (pending 상태)
    const { data: deposit } = await supabaseAdmin
      .from("deposits")
      .select("id, auction_id, user_id, amount, status")
      .eq("order_id", orderId)
      .eq("status", "pending")
      .single();

    if (!deposit) {
      return NextResponse.json({ error: "보증금 레코드를 찾을 수 없습니다" }, { status: 404 });
    }

    // 소유자 확인
    if (deposit.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 금액 일치 확인
    if (deposit.amount !== amount) {
      return NextResponse.json({ error: "금액 불일치" }, { status: 400 });
    }

    // 2. 토스 결제 승인
    const paymentResult = await confirmPayment(paymentKey, orderId, amount);

    // 3. deposits 상태 업데이트 → paid
    const { error: updateError } = await supabaseAdmin
      .from("deposits")
      .update({
        status: "paid",
        payment_key: paymentKey,
        payment_method: paymentResult.method,
        paid_at: new Date().toISOString(),
      })
      .eq("id", deposit.id)
      .eq("status", "pending");

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      depositId: deposit.id,
      auctionId: deposit.auction_id,
    });
  } catch (error) {
    console.error("[API deposit/confirm] Error:", error);

    // 토스 결제 승인 실패 시 deposits → failed
    try {
      const { orderId } = await req.clone().json();
      if (orderId) {
        const supabaseAdmin = createAdminClient();
        await supabaseAdmin
          .from("deposits")
          .update({ status: "failed" })
          .eq("order_id", orderId)
          .eq("status", "pending");
      }
    } catch {
      // cleanup 실패 무시
    }

    return NextResponse.json({ error: "결제 승인 실패" }, { status: 500 });
  }
}
