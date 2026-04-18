// Deno Edge Function for auto-closing expired auctions
// Runs every 5 minutes via Cron

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { notifyAuctionWon } from "../_shared/notify-auction-won.ts";

// CORS 헤더 (Cron에서는 필요 없지만 수동 테스트용)
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

                    // 낙찰 시 알림 발송 (MD 인앱 + MD 알림톡 + 낙찰자 알림톡)
                    // 낙찰자 인앱 알림은 close_auction() DB 함수에서 생성됨
                    if (resultData?.result === "won") {
                        try {
                            await notifyAuctionWon(supabase, auction.id);
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


