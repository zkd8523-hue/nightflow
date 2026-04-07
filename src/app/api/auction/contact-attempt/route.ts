import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// 낙찰자가 MD 연락 버튼(DM/전화) 클릭 시 호출
// → contact_attempted_at 기록 + contact_deadline 해제 (노쇼 타이머 정지)
// 상태는 'won'을 유지한다. 방문 확인은 MD가 수동으로 confirmed 처리.
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

    // 경매 조회 + 본인이 낙찰자인지 확인
    const { data: auction } = await supabaseAdmin
      .from("auctions")
      .select("winner_id, status, contact_attempted_at")
      .eq("id", auctionId)
      .single();

    if (!auction || auction.winner_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (auction.status !== "won") {
      return NextResponse.json({ error: "Not in won status" }, { status: 400 });
    }

    // 이미 기록되어 있으면 무시 (첫 클릭만 기록)
    if (auction.contact_attempted_at) {
      return NextResponse.json({ success: true, alreadyRecorded: true });
    }

    // contact_attempted_at 기록 + 노쇼 타이머 정지 (status는 won 유지)
    const { data, error } = await supabaseAdmin
      .from("auctions")
      .update({
        contact_attempted_at: new Date().toISOString(),
        contact_deadline: null,
      })
      .eq("id", auctionId)
      .eq("status", "won")
      .is("contact_attempted_at", null)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({ success: true, alreadyProcessed: true });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
