import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const GRACE_CANCEL_MS = 5 * 60 * 1000; // 5분

// 낙찰자 자발적 취소 (시간 기반 2구간: grace/late)
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

    // 경매 조회
    const { data: auction } = await supabaseAdmin
      .from("auctions")
      .select("id, winner_id, status, contact_deadline, contact_timer_minutes, won_at, md_id, club:clubs(name)")
      .eq("id", auctionId)
      .single();

    if (!auction) {
      return NextResponse.json({ error: "경매를 찾을 수 없습니다." }, { status: 404 });
    }

    if (auction.winner_id !== user.id) {
      return NextResponse.json({ error: "낙찰자만 취소할 수 있습니다." }, { status: 403 });
    }

    if (!["won", "contacted"].includes(auction.status)) {
      return NextResponse.json(
        { error: `현재 상태(${auction.status})에서는 취소할 수 없습니다.` },
        { status: 400 }
      );
    }

    // 2단계 cancel_type 판정 (Grace 5분 / Late)
    const now = new Date();
    const wonAt = new Date(auction.won_at || now.toISOString());
    const elapsedMs = now.getTime() - wonAt.getTime();

    let cancelType: "user_grace" | "user_late";
    let warningPoints: number;

    if (elapsedMs <= GRACE_CANCEL_MS) {
      cancelType = "user_grace";
      warningPoints = 1;
    } else {
      cancelType = "user_late";
      warningPoints = 2;
    }

    // 경고 부과 (모든 취소에 경고 부과)
    let warningResult = null;
    try {
      const { data } = await supabaseAdmin.rpc("apply_cancel_warning", {
        p_user_id: user.id,
        p_auction_id: auctionId,
        p_warning_points: warningPoints,
        p_cancel_type: cancelType,
      });
      warningResult = data;
    } catch {
      // 경고 부과 실패해도 취소는 진행
    }

    // 차순위 낙찰 시도 (status='won' 상태에서 호출해야 RPC가 작동)
    let fallbackResult = null;
    try {
      const { data } = await supabaseAdmin.rpc("fallback_to_next_bidder", {
        p_auction_id: auctionId,
      });
      fallbackResult = data;
    } catch {
      // fallback 실패 무시
    }

    // fallback이 성공하지 않은 경우에만 cancelled로 전환
    const fbTyped = fallbackResult as { result?: string } | null;
    if (!fbTyped || fbTyped.result !== "fallback_won") {
      await supabaseAdmin
        .from("auctions")
        .update({
          status: "cancelled",
          cancel_type: cancelType,
          cancel_reason: reason || null,
        })
        .eq("id", auctionId)
        .in("status", ["won", "contacted"]);
    }

    // 보증금 몰수 (낙찰 후 취소 = 비환불)
    try {
      const { data: deposit } = await supabaseAdmin
        .from("deposits")
        .select("id, status")
        .eq("auction_id", auctionId)
        .eq("user_id", user.id)
        .in("status", ["paid", "held"])
        .single();

      if (deposit) {
        await supabaseAdmin
          .from("deposits")
          .update({
            status: "forfeited",
            forfeited_at: new Date().toISOString(),
          })
          .eq("id", deposit.id);
      }
    } catch {
      // 몰수 처리 실패해도 취소 진행
    }

    // MD에게 인앱 알림 발송
    if (auction.md_id) {
      try {
        const clubName = (auction.club as unknown as { name: string })?.name || "클럽";
        const isFallbackWon = fbTyped?.result === "fallback_won";
        const message = isFallbackWon
          ? `${clubName} 경매 낙찰자가 취소했습니다. 2순위 입찰자에게 낙찰이 넘어갔습니다.`
          : `${clubName} 경매 낙찰자가 취소했습니다. 대기 입찰자가 없어 유찰되었습니다.`;

        await supabaseAdmin.from("in_app_notifications").insert({
          user_id: auction.md_id,
          type: "md_winner_cancelled",
          title: "낙찰자 취소 안내",
          message,
          action_url: "/md/transactions",
        });
      } catch {
        // 알림 실패는 무시
      }
    }

    return NextResponse.json({
      success: true,
      cancelType,
      isGrace: cancelType === "user_grace",
      warningPoints,
      warningResult,
      fallback: fallbackResult,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
