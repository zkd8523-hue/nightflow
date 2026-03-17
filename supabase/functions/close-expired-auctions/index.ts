// Deno Edge Function for auto-closing expired auctions
// Runs every 5 minutes via Cron
// 낙찰 시 SOLAPI 알림톡 발송

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 헤더 (Cron에서는 필요 없지만 수동 테스트용)
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SOLAPI
const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY");
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET");
const SOLAPI_SENDER = Deno.env.get("SOLAPI_SENDER_NUMBER");
const SOLAPI_PFID = Deno.env.get("SOLAPI_PFID");
const TPL_AUCTION_WON = Deno.env.get("ALIMTALK_TPL_AUCTION_WON");
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://nightflow.co";

interface CloseAuctionResult {
    result: "won" | "unsold";
    winner_id?: string;
}

serve(async (req: Request) => {
    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Supabase Admin 클라이언트 생성 (Service Role Key 사용)
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        console.log("🔍 종료된 경매 검색 시작...");

        // Step 1: 종료 시간이 지난 active 경매 조회
        // effective_end_at = COALESCE(extended_end_at, auction_end_at) stored generated column
        const { data: expiredAuctions, error: fetchError } = await supabase
            .from("auctions")
            .select("id, auction_end_at, extended_end_at, effective_end_at, status")
            .eq("status", "active")
            .lt("effective_end_at", new Date().toISOString())
            .order("effective_end_at", { ascending: true });

        if (fetchError) {
            console.error("❌ 경매 조회 실패:", fetchError);
            throw fetchError;
        }

        if (!expiredAuctions || expiredAuctions.length === 0) {
            console.log("✅ 종료할 경매 없음");
            return new Response(
                JSON.stringify({
                    success: true,
                    message: "종료할 경매 없음",
                    count: 0,
                }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 200,
                }
            );
        }

        console.log(`📦 종료 대상 경매 ${expiredAuctions.length}개 발견`);

        // Step 2: 각 경매에 대해 close_auction() RPC 호출
        const results = {
            total: expiredAuctions.length,
            success: 0,
            failed: 0,
            errors: [] as { auction_id: string; error: string }[],
            details: [] as { auction_id: string; result: string }[],
        };

        for (const auction of expiredAuctions) {
            try {
                console.log(`🔄 경매 종료 중: ${auction.id}`);

                const { data: closeResult, error: closeError } = await supabase.rpc(
                    "close_auction",
                    {
                        p_auction_id: auction.id,
                    }
                );

                if (closeError) {
                    console.error(`❌ 경매 ${auction.id} 종료 실패:`, closeError.message);
                    results.failed++;
                    results.errors.push({
                        auction_id: auction.id,
                        error: closeError.message,
                    });
                } else {
                    const resultData = closeResult as unknown as CloseAuctionResult;
                    console.log(`✅ 경매 ${auction.id} 종료 성공:`, resultData?.result);
                    results.success++;
                    results.details.push({
                        auction_id: auction.id,
                        result: resultData?.result,
                    });

                    // 낙찰 시 알림톡 발송
                    if (resultData?.result === "won") {
                        try {
                            await sendWonNotification(supabase, auction.id);
                        } catch (notifyErr) {
                            console.error(`⚠️ 낙찰 알림 발송 실패 (${auction.id}):`, notifyErr);
                        }
                    }
                }
            } catch (err) {
                console.error(`❌ 경매 ${auction.id} 처리 중 예외:`, err);
                results.failed++;
                results.errors.push({
                    auction_id: auction.id,
                    error: String(err),
                });
            }
        }

        console.log("📊 처리 완료:", results);

        return new Response(JSON.stringify(results), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error) {
        console.error("❌ Edge Function 실행 오류:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: String(error),
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            }
        );
    }
});

// ---- 낙찰 알림톡 발송 ----

async function sendWonNotification(
    supabase: ReturnType<typeof createClient>,
    auctionId: string
): Promise<void> {
    if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !TPL_AUCTION_WON) return;

    // 경매 + 낙찰자 정보 조회
    const { data: auction } = await supabase
        .from("auctions")
        .select("winner_id, winning_price, club:clubs(name)")
        .eq("id", auctionId)
        .single();

    if (!auction?.winner_id) return;

    const { data: winner } = await supabase
        .from("users")
        .select("phone")
        .eq("id", auction.winner_id)
        .single();

    if (!winner?.phone) {
        console.log(`⚠️ 낙찰자 전화번호 없음: ${auction.winner_id}`);
        return;
    }

    const clubName = (auction.club as unknown as { name: string })?.name || "클럽";
    const price = new Intl.NumberFormat("ko-KR").format(auction.winning_price);



    // 연락 타이머 조회 (contact_timer_minutes)
    const { data: auctionTimer } = await supabase
        .from("auctions")
        .select("contact_timer_minutes")
        .eq("id", auctionId)
        .single();
    const timerMinutes = auctionTimer?.contact_timer_minutes || 15;

    await solapiSendAlimtalk(winner.phone, TPL_AUCTION_WON, {
        clubName,
        winningPrice: `${price}원`,
        contactDeadline: `${timerMinutes}분`,
        auctionUrl: `${APP_URL}/auctions/${auctionId}`,
    });

    await supabase.from("notification_logs").insert({
        event_type: "auction_won",
        auction_id: auctionId,
        recipient_user_id: auction.winner_id,
        recipient_phone: winner.phone,
        template_id: TPL_AUCTION_WON,
        status: "sent",
    });

    console.log(`📨 낙찰 알림 발송: ${auctionId} → ${winner.phone}`);
}

// ---- SOLAPI REST API (Deno 호환) ----

async function solapiSendAlimtalk(
    to: string,
    templateId: string,
    vars: Record<string, string>
): Promise<void> {
    const timestamp = Date.now().toString();
    const salt = crypto.randomUUID();

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(SOLAPI_API_SECRET!),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const data = encoder.encode(timestamp + salt);
    const sig = await crypto.subtle.sign("HMAC", key, data);
    const signature = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const formattedVars: Record<string, string> = {};
    for (const [k, v] of Object.entries(vars)) {
        formattedVars[`#{${k}}`] = v;
    }

    const res = await fetch("https://api.solapi.com/messages/v4/send-many", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${timestamp}, salt=${salt}, signature=${signature}`,
        },
        body: JSON.stringify({
            messages: [
                {
                    to: to.replace(/[^0-9]/g, ""),
                    from: SOLAPI_SENDER!.replace(/[^0-9]/g, ""),
                    kakaoOptions: {
                        pfId: SOLAPI_PFID,
                        templateId,
                        variables: formattedVars,
                        disableSms: true,
                    },
                },
            ],
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`SOLAPI error ${res.status}: ${body}`);
    }
}
