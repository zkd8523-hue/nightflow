// Deno Edge Function for daily MD credit recharge
// Runs once per day at 06:00 KST (21:00 UTC previous day)
// Calls recharge_md_credits() RPC: +60 credits (cap 120) + daily counter reset

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

    console.log("🔄 MD 크레딧 일일 충전 시작...");

    const { error } = await supabase.rpc("recharge_md_credits");

    if (error) {
      console.error("❌ 크레딧 충전 실패:", error);
      throw error;
    }

    // 충전 결과 확인
    const { data: stats } = await supabase
      .from("users")
      .select("id")
      .eq("role", "md");

    const mdCount = stats?.length ?? 0;

    console.log(`✅ MD ${mdCount}명 크레딧 충전 + 카운터 초기화 완료`);

    return new Response(
      JSON.stringify({ success: true, md_count: mdCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("❌ Edge Function 실행 오류:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
