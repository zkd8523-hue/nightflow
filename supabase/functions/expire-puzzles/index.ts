// Deno Edge Function for auto-expiring puzzles past their event date
// Runs every minute via Cron (Migration 220)
// expires_at = event_date 당일 21:00 KST (12:00 UTC) — 오퍼 마감(20:00) +60분

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
      .select("id, leader_id, area, event_date, accepted_offer_id, is_recruiting_party")
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

    // 만료된 깃발에 박제된 pending 오퍼를 expired 처리하고 MD 슬롯 카운터 재동기화
    // (Migration 329 — 미선택 마감 시 오퍼 슬롯 누수 방지)
    const { data: syncResult, error: syncError } = await supabase.rpc("sync_md_offer_slots");
    if (syncError) {
      console.error("⚠️ 오퍼 슬롯 동기화 실패:", syncError);
    } else {
      console.log("🔄 오퍼 슬롯 동기화:", syncResult);
    }

    const typedExpired = expiredPuzzles as Array<{
      id: string;
      leader_id: string;
      area: string;
      event_date: string;
      accepted_offer_id: string | null;
      is_recruiting_party: boolean | null;
    }>;

    const formatLabel = (p: { area: string; event_date: string }) => {
      const [, m, d] = p.event_date.split("-").map(Number);
      return `${p.area} ${m}/${d}`;
    };
    // 파티(파티원 모집) / 깃발 구분 라벨
    const kindOf = (p: { is_recruiting_party: boolean | null }) => (p.is_recruiting_party ? "파티" : "깃발");

    // 방장에게 in-app 알림
    const notifRows = typedExpired.map((p) => ({
      user_id: p.leader_id,
      type: "puzzle_expired",
      title: `${kindOf(p)} 만료`,
      message: `${formatLabel(p)} ${kindOf(p)}의 시간이 끝났어요.`,
      action_url: `/flags/${p.id}`,
    }));
    if (notifRows.length > 0) {
      const { error: notifErr } = await supabase.from("in_app_notifications").insert(notifRows);
      if (notifErr) console.error("⚠️ 만료 알림 INSERT 실패:", notifErr);
    }

    // admin 알림 (깃발 만료 + 매치 만료)
    const { data: admins, error: adminErr } = await supabase
      .from("users")
      .select("id")
      .eq("role", "admin")
      .is("deleted_at", null);

    if (adminErr) {
      console.error("⚠️ admin 조회 실패:", adminErr);
    } else if (admins && admins.length > 0) {
      const adminIds = (admins as Array<{ id: string }>).map((a) => a.id);
      const adminRows: Array<{
        user_id: string;
        type: string;
        title: string;
        message: string;
        action_url: string;
      }> = [];

      for (const p of typedExpired) {
        const label = formatLabel(p);
        const kind = kindOf(p);
        for (const adminId of adminIds) {
          adminRows.push({
            user_id: adminId,
            type: "admin_puzzle_expired",
            title: `[관리자] ${kind} 만료`,
            message: `${kind}이 만료되었습니다 — ${label}`,
            action_url: `/flags/${p.id}`,
          });
          if (p.accepted_offer_id) {
            adminRows.push({
              user_id: adminId,
              type: "admin_match_expired",
              title: "[관리자] 매치 만료",
              message: `수락된 매치가 ${kind} 만료로 종료되었습니다 — ${label}`,
              action_url: `/flags/${p.id}`,
            });
          }
        }
      }

      if (adminRows.length > 0) {
        const { error: adminNotifErr } = await supabase
          .from("in_app_notifications")
          .insert(adminRows);
        if (adminNotifErr) console.error("⚠️ admin 알림 INSERT 실패:", adminNotifErr);
      }
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
