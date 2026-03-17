import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// 낙찰자가 MD 미응답 신고 → 타이머 15분 연장 + MD에게 긴급 알림
export async function POST(req: Request) {
  try {
    const { auctionId } = await req.json();

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

    // 경매 확인: won 상태 + 본인이 낙찰자
    const { data: auction } = await supabaseAdmin
      .from("auctions")
      .select("id, winner_id, md_id, status, contact_deadline")
      .eq("id", auctionId)
      .single();

    if (!auction) {
      return NextResponse.json({ error: "경매를 찾을 수 없습니다." }, { status: 404 });
    }

    if (auction.winner_id !== user.id) {
      return NextResponse.json({ error: "낙찰자만 신고할 수 있습니다." }, { status: 403 });
    }

    if (auction.status !== "won") {
      return NextResponse.json(
        { error: "낙찰 대기(won) 상태에서만 신고할 수 있습니다." },
        { status: 400 }
      );
    }

    // 중복 신고 방지
    const { data: existing } = await supabaseAdmin
      .from("md_unresponsive_reports")
      .select("id")
      .eq("auction_id", auctionId)
      .eq("reporter_id", user.id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "이미 신고한 경매입니다." },
        { status: 409 }
      );
    }

    // 신고 생성
    await supabaseAdmin
      .from("md_unresponsive_reports")
      .insert({
        auction_id: auctionId,
        reporter_id: user.id,
        md_id: auction.md_id,
      });

    // 타이머 15분 연장
    const currentDeadline = new Date(auction.contact_deadline || new Date().toISOString());
    const extendedDeadline = new Date(currentDeadline.getTime() + 15 * 60 * 1000);

    await supabaseAdmin
      .from("auctions")
      .update({ contact_deadline: extendedDeadline.toISOString() })
      .eq("id", auctionId);

    // MD에게 인앱 알림 생성
    await supabaseAdmin.from("in_app_notifications").insert({
      user_id: auction.md_id,
      type: "fallback_won", // 기존 타입 재활용 (긴급 알림으로 표시)
      title: "낙찰자가 연락 시도 중입니다!",
      message: "낙찰자가 연락을 시도하고 있습니다. 즉시 확인해주세요.",
      action_url: `/md/transactions`,
    });

    return NextResponse.json({
      success: true,
      extendedDeadline: extendedDeadline.toISOString(),
      extensionMinutes: 15,
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
