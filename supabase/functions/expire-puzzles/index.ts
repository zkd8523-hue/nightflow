// Deno Edge Function for auto-expiring puzzles past their event date
// Runs every 5 minutes via Cron
// expires_at = event_date 당일 18:00 KST (09:00 UTC)

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

    console.log("🔍 만료 퍼즐 검색 시작...");

    const { data: expiredPuzzles, error: fetchError } = await supabase
      .from("puzzles")
      .select("id, leader_id, area, event_date")
      .in("status", ["open", "selecting"])
      .lt("expires_at", new Date().toISOString());

    if (fetchError) {
      console.error("❌ 퍼즐 조회 실패:", fetchError);
      throw fetchError;
    }

    if (!expiredPuzzles || expiredPuzzles.length === 0) {
      console.log("✅ 만료할 퍼즐 없음");
      return new Response(
        JSON.stringify({ success: true, message: "만료할 퍼즐 없음", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`📦 만료 대상 퍼즐 ${expiredPuzzles.length}개 발견`);

    const ids = expiredPuzzles.map((p: { id: string }) => p.id);

    const { error: updateError } = await supabase
      .from("puzzles")
      .update({ status: "expired" })
      .in("id", ids);

    if (updateError) {
      console.error("❌ 퍼즐 만료 처리 실패:", updateError);
      throw updateError;
    }

    // 방장에게 in-app 알림
    const notifRows = (expiredPuzzles as Array<{ id: string; leader_id: string; area: string; event_date: string }>).map((p) => {
      const [, m, d] = p.event_date.split("-").map(Number);
      return {
        user_id: p.leader_id,
        type: "puzzle_expired",
        title: "깃발 만료",
        message: `${p.area} ${m}/${d} 깃발의 시간이 끝났어요.`,
        action_url: "/bids?tab=puzzle",
      };
    });
    if (notifRows.length > 0) {
      const { error: notifErr } = await supabase.from("in_app_notifications").insert(notifRows);
      if (notifErr) console.error("⚠️ 만료 알림 INSERT 실패:", notifErr);
    }

    console.log(`✅ ${ids.length}개 퍼즐 만료 처리 완료`);

    return new Response(
      JSON.stringify({ success: true, expired_count: ids.length }),
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
