// Deno Edge Function: 연락 마감 20분 전 경고 알림
// Cron: 매 2분 (*/2 * * * *)
// status='won' + contact_deadline이 18~22분 남은 경매 → 낙찰자에게 알림톡 발송

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { solapiSendAlimtalk } from "../_shared/solapi.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 알림톡 템플릿 (SOLAPI 자체 환경변수는 _shared/solapi.ts에서 처리)
const TPL_CONTACT_DEADLINE = Deno.env.get("ALIMTALK_TPL_CONTACT_DEADLINE_WARNING");
const APP_URL = (Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://nightflow.co").replace(/^https?:\/\//, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("🔍 연락 마감 임박 경매 검색...");

    // contact_deadline이 18~22분 남은 경매 조회 (2분 간격 cron → 4분 윈도우, 20분 전 중심)
    const now = new Date();
    const minTime = new Date(now.getTime() + 18 * 60000).toISOString();
    const maxTime = new Date(now.getTime() + 22 * 60000).toISOString();

    const { data: auctions, error: fetchError } = await supabase
      .from("auctions")
      .select("id, winner_id, winning_price, contact_deadline, club:clubs(name)")
      .eq("status", "won")
      .not("contact_deadline", "is", null)
      .filter("contact_deadline", "gte", minTime)
      .filter("contact_deadline", "lte", maxTime);

    if (fetchError) {
      console.error("❌ 경매 조회 실패:", fetchError);
      throw fetchError;
    }

    if (!auctions || auctions.length === 0) {
      console.log("✅ 연락 마감 임박 경매 없음");
      return new Response(
        JSON.stringify({ success: true, count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📦 연락 마감 임박 경매 ${auctions.length}개 발견`);

    let sentCount = 0;

    for (const auction of auctions) {
      if (!auction.winner_id) continue;

      // 중복 발송 방지
      const { data: logExists } = await supabase
        .from("notification_logs")
        .select("id")
        .eq("event_type", "contact_deadline_warning")
        .eq("auction_id", auction.id)
        .eq("recipient_user_id", auction.winner_id)
        .eq("status", "sent")
        .limit(1);

      if (logExists && logExists.length > 0) {
        console.log(`⏭️ 이미 발송됨: 경매 ${auction.id}`);
        continue;
      }

      // 낙찰자 전화번호 + 이름 조회
      const { data: winner } = await supabase
        .from("users")
        .select("phone, name")
        .eq("id", auction.winner_id)
        .single();

      if (!winner?.phone) continue;

      const clubName = (auction.club as unknown as { name: string })?.name || "클럽";
      const deadlineDate = new Date(auction.contact_deadline!);
      const remainingMs = deadlineDate.getTime() - now.getTime();
      const remainingMinutes = Math.max(1, Math.round(remainingMs / 60000));

      // 인앱 알림 생성
      try {
        await supabase.from("in_app_notifications").insert({
          user_id: auction.winner_id,
          type: "contact_deadline_warning",
          title: "MD 연락 시간 안내",
          message: `${clubName} 경매 MD 연락 시간이 ${remainingMinutes}분 남았습니다. 아직 연락 전이라면 지금 연락해보세요.`,
          action_url: `/auctions/${auction.id}`,
        });
      } catch (inAppErr) {
        console.error(`⚠️ 인앱 알림 생성 실패 (${auction.id}):`, inAppErr);
      }

      // 알림톡 발송
      if (!TPL_CONTACT_DEADLINE) {
        console.log("⚠️ 알림톡 템플릿 미설정, 건너뜀");
        continue;
      }

      try {
        await solapiSendAlimtalk(winner.phone, TPL_CONTACT_DEADLINE, {
          userName: winner.name || "회원",
          clubName,
          remainingMinutes: String(remainingMinutes),
          auctionUrl: `${APP_URL}/auctions/${auction.id}`,
        });

        await supabase.from("notification_logs").insert({
          event_type: "contact_deadline_warning",
          auction_id: auction.id,
          recipient_user_id: auction.winner_id,
          recipient_phone: winner.phone,
          template_id: TPL_CONTACT_DEADLINE,
          status: "sent",
        });
        sentCount++;
        console.log(`📨 연락 마감 경고 발송: 경매 ${auction.id} (${remainingMinutes}분 남음)`);
      } catch (err) {
        console.error(`❌ 알림톡 발송 실패 (${auction.id}):`, err);
        await supabase.from("notification_logs").insert({
          event_type: "contact_deadline_warning",
          auction_id: auction.id,
          recipient_user_id: auction.winner_id,
          recipient_phone: winner.phone,
          template_id: TPL_CONTACT_DEADLINE,
          status: "failed",
          error_message: String(err),
        });
      }
    }

    console.log(`📊 처리 완료: ${sentCount}건 발송`);

    return new Response(
      JSON.stringify({ success: true, count: sentCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Edge Function 실행 오류:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

