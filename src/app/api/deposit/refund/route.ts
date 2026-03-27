import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cancelPayment } from "@/lib/payments/toss";
import { NextResponse } from "next/server";

// 보증금 환불 → 토스 취소 API + deposits → refunded
export async function POST(req: Request) {
  try {
    const { depositId, reason } = await req.json();
    if (!depositId) {
      return NextResponse.json({ error: "Missing depositId" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // 보증금 조회
    const { data: deposit } = await supabaseAdmin
      .from("deposits")
      .select("id, user_id, md_id, amount, payment_key, status")
      .eq("id", depositId)
      .single();

    if (!deposit) {
      return NextResponse.json({ error: "보증금을 찾을 수 없습니다" }, { status: 404 });
    }

    // 환불 가능 상태 확인
    if (!["paid", "held"].includes(deposit.status)) {
      return NextResponse.json(
        { error: `현재 상태(${deposit.status})에서는 환불할 수 없습니다` },
        { status: 400 }
      );
    }

    // 권한 확인 (본인, MD, Admin)
    const { data: currentUser } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const isOwner = deposit.user_id === user.id;
    const isMd = deposit.md_id === user.id;
    const isAdmin = currentUser?.role === "admin";

    if (!isOwner && !isMd && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 토스 결제 취소
    if (deposit.payment_key) {
      await cancelPayment(
        deposit.payment_key,
        reason || "보증금 환불",
        deposit.amount
      );
    }

    // deposits → refunded
    const { error: updateError } = await supabaseAdmin
      .from("deposits")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        refund_amount: deposit.amount,
        refund_reason: reason || "보증금 환불",
      })
      .eq("id", depositId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API deposit/refund] Error:", error);
    return NextResponse.json({ error: "환불 처리 실패" }, { status: 500 });
  }
}
