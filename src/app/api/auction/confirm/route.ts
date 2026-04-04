import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendAlimtalkAndLog } from "@/lib/notifications/send-and-log";
import { ALIMTALK_TEMPLATES } from "@/lib/notifications/alimtalk";
import { NextResponse } from "next/server";

// MD가 현장 방문 확인 시 호출 → 상태 업데이트 + 알림톡 발송
export async function POST(req: Request) {
  try {
    const { auctionId } = await req.json();
    if (!auctionId) {
      return NextResponse.json(
        { error: "Missing auctionId" },
        { status: 400 }
      );
    }

    // 인증 확인
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // 1. MD 소유 경매인지 확인 및 낙찰자 정보 획득
    const { data: auction } = await supabaseAdmin
      .from("auctions")
      .select("md_id, event_date, winner_id, status, club:clubs(name)")
      .eq("id", auctionId)
      .single();

    if (!auction || auction.md_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 상태 가드: won 또는 contacted에서만 confirmed로 전환 가능
    if (!["won", "contacted"].includes(auction.status)) {
      return NextResponse.json(
        { error: `현재 상태(${auction.status})에서는 확인할 수 없습니다. 낙찰(won) 또는 연락완료(contacted) 상태만 확인 가능합니다.` },
        { status: 400 }
      );
    }

    // 2. Auction 상태 업데이트 (confirmed_at은 트리거가 자동 설정)
    const { error: auctionError } = await supabaseAdmin
      .from("auctions")
      .update({ status: "confirmed", contact_deadline: null })
      .eq("id", auctionId)
      .in("status", ["won", "contacted"]); // won 또는 contacted에서 전환

    if (auctionError) throw auctionError;

    }

    // 3. 낙찰자에게 알림톡 발송
    try {
      if (auction.winner_id) {
        const { data: winner } = await supabaseAdmin
          .from("users")
          .select("phone")
          .eq("id", auction.winner_id)
          .single();

        if (winner?.phone) {
          const clubName =
            (auction.club as unknown as { name: string })?.name || "클럽";

          await sendAlimtalkAndLog({
            eventType: "visit_confirmed",
            auctionId,
            recipientUserId: auction.winner_id,
            recipientPhone: winner.phone,
            templateId: ALIMTALK_TEMPLATES.VISIT_CONFIRMED,
            variables: {
              clubName,
              eventDate: auction.event_date || "",
              reservationCode: "N/A",
            },
          });
        }
      }
    } catch (notifyErr) {
      // 알림 실패는 무시
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API confirm] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
