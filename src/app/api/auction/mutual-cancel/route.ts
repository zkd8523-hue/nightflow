import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendFallbackWonNotification } from "@/lib/notifications/alimtalk";
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

    if (auction.status !== "won") {
      return NextResponse.json(
        { error: `현재 상태(${auction.status})에서는 합의 취소할 수 없습니다.` },
        { status: 400 }
      );
    }

    // 차순위 낙찰 시도
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
    const fbTyped = fallbackResult as { result?: string; new_winner_id?: string } | null;
    if (!fbTyped || fbTyped.result !== "fallback_won") {
      await supabaseAdmin
        .from("auctions")
        .update({
          status: "cancelled",
          cancel_type: "mutual",
          cancel_reason: reason || null,
        })
        .eq("id", auctionId)
        .eq("status", "won");
    }

    // 차순위 낙찰자에게 SMS 발송
    if (fbTyped?.result === "fallback_won" && fbTyped.new_winner_id) {
      try {
        const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://nightflow.co").replace(/^https?:\/\//, "");
        const { data: updatedAuction } = await supabaseAdmin
          .from("auctions")
          .select("current_bid, contact_deadline, clubs(name)")
          .eq("id", auctionId)
          .single();
        const { data: newWinner } = await supabaseAdmin
          .from("users")
          .select("phone, name")
          .eq("id", fbTyped.new_winner_id)
          .single();
        if (newWinner?.phone && updatedAuction) {
          const clubName = (updatedAuction.clubs as unknown as { name: string })?.name || "클럽";
          const winningPrice = new Intl.NumberFormat("ko-KR").format(updatedAuction.current_bid || 0) + "원";
          const contactDeadline = updatedAuction.contact_deadline
            ? new Date(updatedAuction.contact_deadline).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
            : "";
          await sendFallbackWonNotification(newWinner.phone, {
            clubName,
            userName: newWinner.name || "고객",
            winningPrice,
            contactDeadline,
            auctionUrl: `${APP_URL}/auctions/${auctionId}`,
          });
        }
      } catch {
        // 알림 실패는 무시
      }
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
