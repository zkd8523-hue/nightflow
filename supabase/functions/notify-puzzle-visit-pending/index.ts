// Deno Edge Function: 이벤트 다음날 거래확정 OX 요청 알림
// 매일 오전 10시 KST cron으로 실행 권장
// event_date = yesterday AND status='accepted' AND visit_marked_at IS NULL AND visit_requested_at IS NULL
// → MD + 방장 양쪽 in-app 알림 INSERT (notify_puzzle_visit_pending RPC가 처리)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

        const { data, error } = await supabase.rpc("notify_puzzle_visit_pending");

        if (error) {
            console.error("[notify-puzzle-visit-pending] error:", error);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(
            JSON.stringify({
                success: true,
                ...((data as Record<string, unknown>) || {}),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (e) {
        console.error("[notify-puzzle-visit-pending] exception:", e);
        return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
