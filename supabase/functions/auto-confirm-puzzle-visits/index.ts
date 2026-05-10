// Deno Edge Function: 7일 무응답 깃발 거래확정 신청 자동 처리
// 매일 1회 (예: 03:00 KST) cron으로 실행
// - visit_result='visited' & 7일 경과 → 자동 visited 확정 (해피패스, 카운트 +1)
// - visit_result='noshow' & 7일 경과 → admin 큐로 진입 (자동 strike 금지)

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

        const { data, error } = await supabase.rpc("auto_confirm_expired_visits");

        if (error) {
            console.error("[auto-confirm-puzzle-visits] error:", error);
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
        console.error("[auto-confirm-puzzle-visits] exception:", e);
        return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
