import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY");
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET") || "";
const SOLAPI_SENDER = Deno.env.get("SOLAPI_SENDER_NUMBER");
const SOLAPI_PFID = Deno.env.get("SOLAPI_PFID");
const TPL_CLOSING_SOON = Deno.env.get("ALIMTALK_TPL_CLOSING_SOON");
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://nightflow.co";

serve(async (req: Request) => {
  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log("🔍 마감 임박 경매 검색 시작...");

    // 1시간 뒤 마감되는 장기 경매 필터
    const now = new Date();
    const minTime = new Date(now.getTime() + 55 * 60000).toISOString();
    const maxTime = new Date(now.getTime() + 65 * 60000).toISOString();

    const { data: closingAuctions, error: fetchError } = await supabase
      .from("auctions")
      .select("id, effective_end_at, duration_minutes, current_bid, club:clubs(name)")
      .eq("status", "active")
      .gte("duration_minutes", 60) // 1시간 이상(단기 경매 제외)
      // .gte("effective_end_at", minTime)
      // .lte("effective_end_at", maxTime);
      // Deno edge function Supabase type bug workaround:
      .filter('effective_end_at', 'gte', minTime)
      .filter('effective_end_at', 'lte', maxTime);

    if (fetchError) {
      console.error("❌ 경매 조회 실패:", fetchError);
      throw fetchError;
    }

    if (!closingAuctions || closingAuctions.length === 0) {
      console.log("✅ 마감 임박 경매 없음");
      return new Response(JSON.stringify({ success: true, count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    let sentCount = 0;

    for (const auction of closingAuctions) {
      console.log(`🔔 경매 마감 1시간 전 알림 전송: ${auction.id}`);

      // 입찰 내역 및 사용자 목록 가져오기 (알림톡 동의한 유저만)
      const { data: bidders } = await supabase
        .from("bids")
        .select("user_id, users!inner(phone, alimtalk_consent)")
        .eq("auction_id", auction.id);

      if (!bidders || bidders.length === 0) continue;

      const uniqueBidders = new Map();
      for (const b of bidders) {
        const user = b.users as unknown as { phone: string; alimtalk_consent: boolean };
        if (user?.phone && user.alimtalk_consent && !uniqueBidders.has(b.user_id)) {
          uniqueBidders.set(b.user_id, user.phone);
        }
      }

      for (const [userId, phone] of uniqueBidders.entries()) {
        const { data: logExists } = await supabase
          .from("notification_logs")
          .select("id")
          .eq("event_type", "closing_soon")
          .eq("auction_id", auction.id)
          .eq("recipient_user_id", userId)
          .eq("status", "sent")
          .limit(1);

        if (logExists && logExists.length > 0) continue;

        const clubName = (auction.club as unknown as { name: string })?.name || "클럽";
        const currentBidStr = new Intl.NumberFormat("ko-kr").format(auction.current_bid || 0);

        try {
          await sendClosingSoonAlimtalk(phone, {
            clubName: clubName,
            currentBid: `${currentBidStr}원`,
            remainingTime: "1시간",
            auctionUrl: `${APP_URL}/auctions/${auction.id}`
          });

          await supabase.from("notification_logs").insert({
            event_type: "closing_soon",
            auction_id: auction.id,
            recipient_user_id: userId,
            recipient_phone: phone,
            template_id: TPL_CLOSING_SOON,
            status: "sent",
          });
          sentCount++;
        } catch (e) {
          console.error("❌ 카카오 알림톡 실패:", e);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, count: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function sendClosingSoonAlimtalk(to: string, vars: Record<string, string>): Promise<void> {
  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !TPL_CLOSING_SOON) {
    console.warn("SOLAPI 알림이 비활성화 되어있습니다 (ENV 미설정)");
    return;
  }

  const timestamp = Date.now().toString();
  const salt = crypto.randomUUID();

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SOLAPI_API_SECRET),
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
            templateId: TPL_CLOSING_SOON,
            variables: formattedVars,
            disableSms: true,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`SOLAPI Error: ${await res.text()}`);
  }
}
