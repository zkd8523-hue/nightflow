import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// MD 합의 취소 (MD가 고객과 합의 후 취소 → 스트라이크 없음)
export async function POST(req: Request) {
  try {
    const { auctionId, reason } = await req.json();

    if (!auctionId) {
      return NextResponse.json({ error: "Missing auctionId" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // MD 소유 확인
    const { data: auction } = await supabaseAdmin
      .from("auctions")
      .select("id, md_id, winner_id, status")
      .eq("id", auctionId)
      .single();

    if (!auction || auction.md_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!["won", "contacted"].includes(auction.status)) {
      return NextResponse.json(
        { error: `현재 상태(${auction.status})에서는 합의 취소할 수 없습니다.` },
        { status: 400 }
      );
    }

    // 차순위 낙찰 시도 (won 상태에서만 가능 — contacted는 MD가 이미 연락 확인했으므로 fallback 불가)
    let fallbackResult = null;
    if (auction.status === "won") {
      try {
        const { data } = await supabaseAdmin.rpc("fallback_to_next_bidder", {
          p_auction_id: auctionId,
        });
        fallbackResult = data;
      } catch {
        // fallback 실패 무시
      }
    }

    // fallback이 성공하지 않은 경우에만 cancelled로 전환
    const fbTyped = fallbackResult as { result?: string } | null;
    if (!fbTyped || fbTyped.result !== "fallback_won") {
      await supabaseAdmin
        .from("auctions")
        .update({
          status: "cancelled",
          cancel_type: "mutual",
          cancel_reason: reason || null,
        })
        .eq("id", auctionId)
        .in("status", ["won", "contacted"]);
    }

    return NextResponse.json({
      success: true,
      cancelType: "mutual",
      fallback: fallbackResult,
    });
  } catch (error) {
    console.error("[API mutual-cancel] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
