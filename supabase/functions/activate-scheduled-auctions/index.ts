// Deno Edge Function: 예정 경매 활성화 + 알림톡 발송
// Cron: 매 1분 (* * * * *)
// 1) status=scheduled + auction_start_at <= now → status=active로 전환
// 2) auction_notify_subscriptions에서 구독자 조회 → SOLAPI 알림톡 발송

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// SOLAPI
const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY");
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET");
const SOLAPI_SENDER = Deno.env.get("SOLAPI_SENDER_NUMBER");
const SOLAPI_PFID = Deno.env.get("SOLAPI_PFID");
const TPL_AUCTION_STARTED = Deno.env.get("ALIMTALK_TPL_AUCTION_STARTED");
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://nightflow.co";

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

    const now = new Date().toISOString();

    // 1. 시작 시간이 지난 scheduled 경매 조회
    const { data: auctions, error } = await supabase
      .from("auctions")
      .select("id, title, club_id, clubs(name)")
      .eq("status", "scheduled")
      .lte("auction_start_at", now);

    if (error) throw error;

    if (!auctions || auctions.length === 0) {
      return new Response(
        JSON.stringify({ message: "활성화할 경매 없음", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📦 활성화 대상 경매 ${auctions.length}개 발견`);

    const results = { activated: 0, notified: 0, errors: [] as string[] };

    for (const auction of auctions) {
      // 2. status를 active로 전환
      const { error: updateError } = await supabase
        .from("auctions")
        .update({ status: "active" })
        .eq("id", auction.id)
        .eq("status", "scheduled"); // 동시 실행 방지

      if (updateError) {
        results.errors.push(`${auction.id}: ${updateError.message}`);
        continue;
      }
      results.activated++;
      console.log(`✅ 경매 활성화: ${auction.id}`);

      // 3. 구독자 조회
      const { data: subs } = await supabase
        .from("auction_notify_subscriptions")
        .select("user_id, phone")
        .eq("auction_id", auction.id);

      if (!subs || subs.length === 0) continue;

      // 4. SOLAPI가 설정되지 않았으면 skip
      if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !TPL_AUCTION_STARTED) {
        console.log("⚠️ SOLAPI 미설정, 알림톡 건너뜀");
        continue;
      }

      const clubName =
        (auction.clubs as unknown as { name: string })?.name || "클럽";
      const auctionUrl = `${APP_URL}/auctions/${auction.id}`;

      for (const sub of subs) {
        try {
          await solapiSend(sub.phone, {
            clubName,
            auctionTitle: auction.title,
            auctionUrl,
          });

          await supabase.from("notification_logs").insert({
            event_type: "auction_started",
            auction_id: auction.id,
            recipient_user_id: sub.user_id,
            recipient_phone: sub.phone,
            template_id: TPL_AUCTION_STARTED,
            status: "sent",
          });
          results.notified++;
        } catch (err) {
          console.error(`❌ 알림 발송 실패 (${sub.phone}):`, err);
          await supabase.from("notification_logs").insert({
            event_type: "auction_started",
            auction_id: auction.id,
            recipient_user_id: sub.user_id,
            recipient_phone: sub.phone,
            template_id: TPL_AUCTION_STARTED,
            status: "failed",
            error_message: String(err),
          });
        }
      }
    }

    console.log("📊 처리 완료:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Edge Function 실행 오류:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

// ---- SOLAPI REST API 직접 호출 (Deno 호환) ----

async function solapiSend(
  to: string,
  vars: Record<string, string>
): Promise<void> {
  const timestamp = Date.now().toString();
  const salt = crypto.randomUUID();

  // HMAC-SHA256 서명 생성
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SOLAPI_API_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = encoder.encode(timestamp + salt);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const signature = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // 템플릿 변수 포맷: #{변수명}
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
            templateId: TPL_AUCTION_STARTED,
            variables: formattedVars,
            disableSms: true,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SOLAPI error ${res.status}: ${body}`);
  }
}
