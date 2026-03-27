import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateDepositOrderId, DEPOSIT_AMOUNT } from "@/lib/payments/deposit-helpers";
import { NextResponse } from "next/server";

// 보증금 결제 요청 생성 → deposits pending INSERT, orderId 반환
export async function POST(req: Request) {
  try {
    const { auctionId } = await req.json();
    if (!auctionId) {
      return NextResponse.json({ error: "Missing auctionId" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // 경매 확인
    const { data: auction } = await supabaseAdmin
      .from("auctions")
      .select("id, md_id, deposit_required, deposit_amount, status")
      .eq("id", auctionId)
      .single();

    if (!auction) {
      return NextResponse.json({ error: "경매를 찾을 수 없습니다" }, { status: 404 });
    }

    if (!auction.deposit_required) {
      return NextResponse.json({ error: "보증금이 필요하지 않은 경매입니다" }, { status: 400 });
    }

    if (!["active", "scheduled"].includes(auction.status)) {
      return NextResponse.json({ error: "입찰 가능한 경매가 아닙니다" }, { status: 400 });
    }

    // 이미 활성 보증금이 있는지 확인
    const { data: existing } = await supabaseAdmin
      .from("deposits")
      .select("id, status")
      .eq("auction_id", auctionId)
      .eq("user_id", user.id)
      .in("status", ["paid", "held", "pending"])
      .limit(1)
      .single();

    if (existing) {
      if (existing.status === "pending") {
        // 기존 pending 삭제 후 재생성
        await supabaseAdmin.from("deposits").delete().eq("id", existing.id);
      } else {
        return NextResponse.json({
          error: "이미 보증금이 결제되었습니다",
          depositId: existing.id,
        }, { status: 409 });
      }
    }

    const amount = auction.deposit_amount || DEPOSIT_AMOUNT;
    const orderId = generateDepositOrderId(auctionId, user.id);

    // deposits 레코드 생성 (pending)
    const { data: deposit, error: insertError } = await supabaseAdmin
      .from("deposits")
      .insert({
        auction_id: auctionId,
        user_id: user.id,
        md_id: auction.md_id,
        amount,
        order_id: orderId,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      depositId: deposit.id,
      orderId,
      amount,
      orderName: "NightFlow 예약 보증금",
    });
  } catch (error) {
    console.error("[API deposit/create] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
