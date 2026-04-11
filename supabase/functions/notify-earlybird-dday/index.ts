// Deno Edge Function: 얼리버드 경매 당일 방문 리마인더
// Cron: 매일 오전 10시 KST (0 1 * * * — UTC 기준)
//
// 조건: listing_type='auction' + event_date=오늘 + status IN ('won','contacted') + d_day_checked_in=false
// 중복 방지: notification_logs에서 earlybird_dday_reminder 이미 발송된 건 스킵

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { solapiSendAlimtalk } from "../_shared/solapi.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TPL_EARLYBIRD_DDAY = Deno.env.get("ALIMTALK_TPL_EARLYBIRD_DDAY_REMINDER");

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

    // 오늘 날짜 (KST 기준: UTC+9)
    const nowUtc = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(nowUtc.getTime() + kstOffset);
    const todayKst = kstDate.toISOString().slice(0, 10); // YYYY-MM-DD

    console.log(`🔍 얼리버드 당일 리마인더 대상 검색 (오늘: ${todayKst})...`);

    const { data: auctions, error: fetchError } = await supabase
      .from("auctions")
      .select("id, winner_id, entry_time, club:clubs(name)")
      .eq("listing_type", "auction")
      .eq("event_date", todayKst)
      .in("status", ["won", "contacted"])
      .eq("d_day_checked_in", false);

    if (fetchError) {
      console.error("❌ 경매 조회 실패:", fetchError);
      throw fetchError;
    }

    if (!auctions || auctions.length === 0) {
      console.log("✅ 오늘 방문 대상 얼리버드 없음");
      return new Response(
        JSON.stringify({ success: true, count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📦 오늘 방문 얼리버드 경매 ${auctions.length}개 발견`);

    let sentCount = 0;

    for (const auction of auctions) {
      if (!auction.winner_id) continue;

      // 중복 발송 방지
      const { data: logExists } = await supabase
        .from("notification_logs")
        .select("id")
        .eq("event_type", "earlybird_dday_reminder")
        .eq("auction_id", auction.id)
        .eq("status", "sent")
        .limit(1);

      if (logExists && logExists.length > 0) {
        console.log(`⏭️ 이미 발송됨: 경매 ${auction.id}`);
        continue;
      }

      // 낙찰자 전화번호 조회
      const { data: winner } = await supabase
        .from("users")
        .select("phone")
        .eq("id", auction.winner_id)
        .single();

      if (!winner?.phone) continue;

      const clubName = (auction.club as unknown as { name: string })?.name || "클럽";
      const entryTime = auction.entry_time as string | null;
      const eventTimeText = entryTime ? entryTime.slice(0, 5) : "저녁";

      // 인앱 알림 생성
      try {
        await supabase.from("in_app_notifications").insert({
          user_id: auction.winner_id,
          type: "earlybird_dday_reminder",
          title: "오늘 방문 리마인더",
          message: `오늘 ${eventTimeText} ${clubName} 방문 예정입니다. 즐거운 시간 되세요!`,
          action_url: `/auctions/${auction.id}`,
        });
      } catch (inAppErr) {
        console.error(`⚠️ 인앱 알림 생성 실패 (${auction.id}):`, inAppErr);
      }

      // 알림톡 발송
      if (!TPL_EARLYBIRD_DDAY) {
        console.log("⚠️ 알림톡 템플릿 미설정, 인앱 알림만 발송됨");
        sentCount++;
        continue;
      }

      try {
        await solapiSendAlimtalk(winner.phone, TPL_EARLYBIRD_DDAY, {
          clubName,
          eventTime: eventTimeText,
        });

        await supabase.from("notification_logs").insert({
          event_type: "earlybird_dday_reminder",
          auction_id: auction.id,
          recipient_user_id: auction.winner_id,
          recipient_phone: winner.phone,
          template_id: TPL_EARLYBIRD_DDAY,
          status: "sent",
        });
        sentCount++;
        console.log(`📨 당일 리마인더 발송: 경매 ${auction.id} (${clubName} ${eventTimeText})`);
      } catch (err) {
        console.error(`❌ 알림톡 발송 실패 (${auction.id}):`, err);
        await supabase.from("notification_logs").insert({
          event_type: "earlybird_dday_reminder",
          auction_id: auction.id,
          recipient_user_id: auction.winner_id,
          recipient_phone: winner.phone,
          template_id: TPL_EARLYBIRD_DDAY,
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
