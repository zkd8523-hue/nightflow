import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// MD가 노쇼 처리 시 호출 → 유저 패널티 부과 + 차순위 낙찰
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
            .select("md_id, winner_id, status, event_date")
            .eq("id", auctionId)
            .single();

        if (!auction || auction.md_id !== user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 상태 가드: won 또는 contacted 상태에서만 노쇼 처리 가능
        if (!["won", "contacted"].includes(auction.status)) {
            return NextResponse.json(
                { error: `현재 상태(${auction.status})에서는 노쇼 처리할 수 없습니다.` },
                { status: 400 }
            );
        }

        const winnerId = auction.winner_id;
        if (!winnerId) {
            return NextResponse.json({ error: "Winner not found" }, { status: 404 });
        }


        // 2. 유저 패널티 부여 (apply_noshow_strike RPC 호출)
        const { data: strikeResult, error: strikeError } = await supabaseAdmin.rpc(
            "apply_noshow_strike",
            { p_user_id: winnerId }
        );
        if (strikeError) throw strikeError;

        // 3. 차순위 낙찰 시도 (event_date가 미래 + status가 won일 때만)
        // fallback_to_next_bidder RPC는 status='won'을 요구하므로 cancelled 전환 전에 실행
        let fallbackResult = null;
        const eventDate = auction.event_date ? new Date(auction.event_date) : null;
        const isFutureEvent = eventDate && eventDate > new Date();

        if (isFutureEvent && auction.status === "won") {
            try {
                const { data: fbResult } = await supabaseAdmin.rpc(
                    "fallback_to_next_bidder",
                    { p_auction_id: auctionId }
                );
                fallbackResult = fbResult;
            } catch (fbError) {
                // fallback 실패 시 아래에서 cancelled 처리
            }
        }

        // 4. fallback이 성공하지 않은 경우에만 cancelled로 전환
        const fbTyped = fallbackResult as { result?: string } | null;
        if (!fbTyped || fbTyped.result !== "fallback_won") {
            await supabaseAdmin
                .from("auctions")
                .update({ status: "cancelled", cancel_type: "noshow_md" })
                .eq("id", auctionId)
                .in("status", ["won", "contacted"]);
        }

        // 5. 알림 발송 (유저에게 정지 안내)
        try {
            const { data: userData } = await supabaseAdmin
                .from("users")
                .select("phone, name")
                .eq("id", winnerId)
                .single();

            if (userData?.phone) {
                const { sendAlimtalkAndLog } = await import("@/lib/notifications/send-and-log");
                const { ALIMTALK_TEMPLATES } = await import("@/lib/notifications/alimtalk");

                const penaltyMsg = strikeResult.action === 'permanent_block'
                    ? "영구 정지 조치되었습니다."
                    : strikeResult.blocked_until
                        ? `${new Date(strikeResult.blocked_until).toLocaleDateString()}까지 이용 정지되었습니다.`
                        : "주의 조치되었습니다.";

                await sendAlimtalkAndLog({
                    eventType: "noshow_penalty",
                    auctionId: auctionId,
                    recipientUserId: winnerId,
                    recipientPhone: userData.phone,
                    templateId: ALIMTALK_TEMPLATES.NOSHOW_BANNED,
                    variables: {
                        userName: userData.name || "고객",
                        strikeCount: strikeResult.strike_count.toString(),
                        penaltyStatus: penaltyMsg
                    },
                });
            }
        } catch (notifError) {
            // 알림 실패는 무시
        }

        return NextResponse.json({
            success: true,
            action: strikeResult.action,
            strikeCount: strikeResult.strike_count,
            bannedUntil: strikeResult.blocked_until,
            fallback: fallbackResult
        });
    } catch (error) {
        console.error("[API noshow] Error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
