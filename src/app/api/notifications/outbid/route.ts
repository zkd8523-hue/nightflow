import { createAdminClient } from "@/lib/supabase/admin";
import { sendAlimtalkAndLog } from "@/lib/notifications/send-and-log";
import { ALIMTALK_TEMPLATES } from "@/lib/notifications/alimtalk";
import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

// Outbid 발생 시 클라이언트에서 호출하는 알림 API
export async function POST(req: Request) {
  try {
    const { auctionId, outbidUserId } = await req.json();
    if (!auctionId || !outbidUserId) {
      return NextResponse.json(
        { error: "Missing auctionId or outbidUserId" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 경매 정보 조회 (클럽 이름 + 현재 입찰가)
    const { data: auction } = await supabase
      .from("auctions")
      .select("current_bid, club:clubs(name)")
      .eq("id", auctionId)
      .single();

    if (!auction) {
      return NextResponse.json(
        { error: "Auction not found" },
        { status: 404 }
      );
    }

    const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://nightflow.co").replace(/^https?:\/\//, "");
    const clubName =
      (auction.club as unknown as { name: string })?.name || "클럽";
    const price = new Intl.NumberFormat("ko-KR").format(
      auction.current_bid || 0
    );

    // 인앱 알림 생성 (전화번호/동의 여부와 무관하게 항상 생성)
    try {
      await supabase.from("in_app_notifications").insert({
        user_id: outbidUserId,
        type: "outbid",
        title: "입찰이 추월되었습니다",
        message: `${clubName} 경매에서 다른 유저가 ${price}원으로 입찰했습니다. 재입찰하여 경쟁에 참여하세요!`,
        action_url: `/auctions/${auctionId}`,
      });
    } catch (inAppErr) {
      logger.error("[notification/outbid] in-app notification failed:", inAppErr);
    }

    // Alimtalk 발송 (전화번호 + 동의 필요)
    const { data: outbidUser } = await supabase
      .from("users")
      .select("phone, alimtalk_consent")
      .eq("id", outbidUserId)
      .single();

    if (!outbidUser?.phone || !outbidUser.alimtalk_consent) {
      return NextResponse.json({ success: true, skipped: !outbidUser?.phone ? "no_phone" : "no_consent" });
    }

    await sendAlimtalkAndLog({
      eventType: "outbid",
      auctionId,
      recipientUserId: outbidUserId,
      recipientPhone: outbidUser.phone,
      templateId: ALIMTALK_TEMPLATES.OUTBID,
      variables: {
        clubName,
        newBidAmount: `${price}원`,
        auctionUrl: `${APP_URL}/auctions/${auctionId}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[notification/outbid]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
