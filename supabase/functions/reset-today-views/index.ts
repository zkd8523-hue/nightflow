// Deno Edge Function: 매일 새벽 4시 KST에 auctions.today_view_count = 0 리셋
// Cron: "0 19 * * *" (UTC 19:00 = KST 04:00)

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

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("🌅 오늘 조회수 리셋 시작 (KST 04:00)");

    const { data, error } = await supabase.rpc("reset_today_view_counts");

    if (error) {
      console.error("❌ 리셋 실패:", error);
      throw error;
    }

    console.log(`✅ ${data ?? 0}개 경매 today_view_count = 0`);

    return new Response(
      JSON.stringify({ success: true, reset_count: data ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("❌ Edge Function 오류:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
