import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// MD가 오늘특가(instant) 경매의 거래완료 처리
// active → confirmed (MD 수동)
export async function POST(req: Request) {
  try {
    const { auctionId, saleChannel } = await req.json();
    if (!auctionId) {
      return NextResponse.json({ error: "Missing auctionId" }, { status: 400 });
    }
    if (!saleChannel || !["nightflow", "other"].includes(saleChannel)) {
      return NextResponse.json({ error: "Missing saleChannel" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // 경매 조회: 본인 소유 + instant + active
    const { data: auction } = await supabaseAdmin
      .from("auctions")
      .select("id, md_id, status, listing_type")
      .eq("id", auctionId)
      .single();

    if (!auction || auction.md_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (auction.listing_type !== "instant") {
      return NextResponse.json({ error: "Only instant listings supported" }, { status: 400 });
    }

    if (!["active", "scheduled"].includes(auction.status)) {
      return NextResponse.json(
        { error: `현재 상태(${auction.status})에서는 거래완료 처리할 수 없습니다.` },
        { status: 400 }
      );
    }

    // active/scheduled → confirmed
    const { error: updateError } = await supabaseAdmin
      .from("auctions")
      .update({ status: "confirmed", sale_channel: saleChannel })
      .eq("id", auctionId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API complete] Error:", error?.message || error);
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
