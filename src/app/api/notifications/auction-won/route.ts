import { createAdminClient } from "@/lib/supabase/admin";
import { sendAlimtalkAndLog } from "@/lib/notifications/send-and-log";
import { ALIMTALK_TEMPLATES } from "@/lib/notifications/alimtalk";
import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

// 경매 종료 시 호출하는 알림 API
// MD에게 먼저 알린 후, 유저에게 알림 발송
export async function POST(req: Request) {
  try {
    const { auctionId } = await req.json();
    if (!auctionId) {
      return NextResponse.json(
        { error: "Missing auctionId" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://nightflow.co").replace(/^https?:\/\//, "");

    const { data: auction } = await supabase
      .from("auctions")
      .select("winner_id, md_id, winning_price, table_info, event_date, club:clubs(name)")
      .eq("id", auctionId)
      .eq("status", "won")
      .single();

    if (!auction?.winner_id) {
      return NextResponse.json(
        { error: "Auction not in won state" },
        { status: 400 }
      );
    }

    const clubName =
      (auction.club as unknown as { name: string })?.name || "클럽";
    const price = new Intl.NumberFormat("ko-KR").format(
      auction.winning_price || 0
    );
    // ─── 1. MD 알림 (먼저 발송) ───
    if (auction.md_id) {
      // MD 인앱 알림
      try {
        await supabase.from("in_app_notifications").insert({
          user_id: auction.md_id,
          type: "auction_won",
          title: "새 낙찰이 발생했습니다!",
          message: `${clubName} ${tableInfo} | ${price}원 낙찰. 곧 고객이 연락합니다.`,
          action_url: `/md/transactions`,
        });
      } catch (inAppErr) {
        logger.error("[notification/auction-won] MD in-app notification failed:", inAppErr);
      }

      // MD 알림톡
      const { data: md } = await supabase
        .from("users")
        .select("phone")
        .eq("id", auction.md_id)
        .single();

      if (md?.phone) {
        try {
          await sendAlimtalkAndLog({
            eventType: "auction_won",
            auctionId,
            recipientUserId: auction.md_id,
            recipientPhone: md.phone,
            templateId: ALIMTALK_TEMPLATES.MD_NEW_MATCH,
            variables: {
              clubName,
              winningPrice: `${price}원`,
              auctionUrl: `${APP_URL}/auctions/${auctionId}`,
            },
          });
        } catch (mdAlimErr) {
          logger.error("[notification/auction-won] MD alimtalk failed:", mdAlimErr);
        }
      }
    }

    // ─── 2. 유저(낙찰자) 알림 ───
    // 인앱 알림
    try {
      await supabase.from("in_app_notifications").insert({
        user_id: auction.winner_id,
        type: "auction_won",
        title: "낙찰을 축하합니다!",
        message: `${clubName} ${tableInfo}을 ${price}원에 낙찰받았습니다. MD에게 연락하세요!`,
        action_url: `/auctions/${auctionId}`,
      });
    } catch (inAppErr) {
      logger.error("[notification/auction-won] winner in-app notification failed:", inAppErr);
    }

    // 유저 알림톡
    const { data: winner } = await supabase
      .from("users")
      .select("phone")
      .eq("id", auction.winner_id)
      .single();

    if (!winner?.phone) {
      return NextResponse.json({ success: true, skipped: "no_phone" });
    }

    await sendAlimtalkAndLog({
      eventType: "auction_won",
      auctionId,
      recipientUserId: auction.winner_id,
      recipientPhone: winner.phone,
      templateId: ALIMTALK_TEMPLATES.AUCTION_WON,
      variables: {
        clubName,
        winningPrice: `${price}원`,
        contactDeadline: "제한 시간 내",
        auctionUrl: `${APP_URL}/auctions/${auctionId}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[notification/auction-won]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
