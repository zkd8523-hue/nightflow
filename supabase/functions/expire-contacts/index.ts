// Deno Edge Function: 연락 마감 자동 노쇼 처리
// Cron: 매 1분 (* * * * *)
// status='won' + contact_deadline < now → 전부 노쇼
// (소비자가 연락했으면 이미 contacted로 전환되어 여기 안 걸림)
// 1) 노쇼 스트라이크 적용 (apply_noshow_strike)
// 2) 차순위 입찰자에게 낙찰 전환 (fallback_to_next_bidder)
// 3) 알림톡 발송: 노쇼 유저(NOSHOW_BANNED) + 차순위 낙찰자(FALLBACK_WON)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// SOLAPI
const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY");
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET") || "";
const SOLAPI_SENDER = Deno.env.get("SOLAPI_SENDER_NUMBER");
const SOLAPI_PFID = Deno.env.get("SOLAPI_PFID");
const TPL_NOSHOW_BANNED = Deno.env.get("ALIMTALK_TPL_NOSHOW_BANNED");
const TPL_FALLBACK_WON = Deno.env.get("ALIMTALK_TPL_FALLBACK_WON");
const TPL_AUCTION_WON = Deno.env.get("ALIMTALK_TPL_AUCTION_WON");
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

    console.log("🔍 연락 마감 초과 경매 검색...");

    // 1. status='won' + contact_deadline이 지난 경매 조회
    const now = new Date().toISOString();
    const { data: expiredContacts, error: fetchError } = await supabase
      .from("auctions")
      .select("id, winner_id, winning_price, contact_timer_minutes, md_id, club:clubs(name)")
      .eq("status", "won")
      .not("contact_deadline", "is", null)
      .lt("contact_deadline", now);

    if (fetchError) {
      console.error("❌ 경매 조회 실패:", fetchError);
      throw fetchError;
    }

    if (!expiredContacts || expiredContacts.length === 0) {
      console.log("✅ 연락 마감 초과 경매 없음");
      return new Response(
        JSON.stringify({ success: true, count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📦 연락 마감 초과 경매 ${expiredContacts.length}개 발견`);

    const results = {
      total: expiredContacts.length,
      strikes: 0,
      fallbacks: 0,
      unsold: 0,
      errors: [] as string[],
    };

    for (const auction of expiredContacts) {
      try {
        const winnerId = auction.winner_id;
        const clubName = (auction.club as unknown as { name: string })?.name || "클럽";
        const price = new Intl.NumberFormat("ko-KR").format(auction.winning_price || 0);

        // 2. 노쇼 스트라이크 적용
        // (소비자가 연락했으면 이미 contacted → 여기 안 걸림)
        console.log(`⚠️ 노쇼 스트라이크 적용: 경매 ${auction.id}, 유저 ${winnerId}`);
        const { data: strikeResult, error: strikeError } = await supabase.rpc(
          "apply_noshow_strike",
          { p_user_id: winnerId }
        );

        if (strikeError) {
          console.error(`❌ 스트라이크 적용 실패 (${auction.id}):`, strikeError.message);
          results.errors.push(`strike:${auction.id}:${strikeError.message}`);
        } else {
          results.strikes++;

          // 노쇼 유저에게 알림톡 발송
          await sendNoshowNotification(supabase, winnerId, strikeResult);
          // 노쇼 유저에게 인앱 알림
          await createInAppNotification(supabase, winnerId, {
            type: "noshow_penalty",
            title: "노쇼 스트라이크가 부과되었습니다",
            message: `${clubName} 경매 낙찰 후 연락 시간이 만료되어 스트라이크가 부과되었습니다.`,
            action_url: `/my-bids`,
          });
        }

        // 3. 차순위 낙찰 시도
        console.log(`🔄 차순위 낙찰 시도: 경매 ${auction.id}`);
        const { data: fallbackResult, error: fallbackError } = await supabase.rpc(
          "fallback_to_next_bidder",
          { p_auction_id: auction.id }
        );

        if (fallbackError) {
          console.error(`❌ 차순위 낙찰 실패 (${auction.id}):`, fallbackError.message);
          results.errors.push(`fallback:${auction.id}:${fallbackError.message}`);
          // fallback 실패 시 경매를 취소 상태로 전환 (재처리 방지)
          await supabase.from("auctions")
            .update({ status: "cancelled", cancel_type: "noshow_auto" })
            .eq("id", auction.id);
          continue;
        }

        const fbResult = fallbackResult as unknown as {
          result: string;
          winner_id?: string;
          winning_price?: number;
        };

        if (fbResult?.result === "fallback_won" && fbResult.winner_id) {
          results.fallbacks++;
          console.log(`✅ 차순위 낙찰 성공: 경매 ${auction.id} → ${fbResult.winner_id}`);

          // 차순위 낙찰자에게 알림톡 + 인앱 알림
          const newPrice = new Intl.NumberFormat("ko-KR").format(fbResult.winning_price || 0);

          // 새 경매의 contact_timer 조회
          const { data: updatedAuction } = await supabase
            .from("auctions")
            .select("contact_timer_minutes")
            .eq("id", auction.id)
            .single();
          const timerMinutes = updatedAuction?.contact_timer_minutes || 15;

          await sendFallbackWonNotification(supabase, auction.id, fbResult.winner_id, {
            clubName,
            winningPrice: `${newPrice}원`,
            contactDeadline: `${timerMinutes}분`,
            auctionUrl: `${APP_URL}/auctions/${auction.id}`,
          });

          await createInAppNotification(supabase, fbResult.winner_id, {
            type: "fallback_won",
            title: "차순위 낙찰 안내",
            message: `${clubName} 경매에서 ${newPrice}원에 낙찰되었습니다. MD에게 연락하세요!`,
            action_url: `/auctions/${auction.id}`,
          });

          // MD에게 노쇼 + 차순위 낙찰 알림
          if (auction.md_id) {
            await createInAppNotification(supabase, auction.md_id, {
              type: "md_winner_noshow",
              title: "낙찰자 노쇼 → 차순위 낙찰",
              message: `${clubName} 경매 낙찰자의 연락 시간이 만료되어 노쇼 처리되었습니다. 2순위 입찰자에게 낙찰이 넘어갔습니다.`,
              action_url: `/md/transactions`,
            });
          }
        } else {
          results.unsold++;
          console.log(`📭 차순위 입찰자 없음 → unsold: 경매 ${auction.id}`);

          // MD에게 노쇼 + 유찰 알림
          if (auction.md_id) {
            await createInAppNotification(supabase, auction.md_id, {
              type: "md_winner_noshow",
              title: "낙찰자 노쇼 → 유찰",
              message: `${clubName} 경매 낙찰자의 연락 시간이 만료되어 노쇼 처리되었습니다. 대기 입찰자가 없어 유찰되었습니다.`,
              action_url: `/md/transactions`,
            });
          }
        }
      } catch (err) {
        console.error(`❌ 경매 ${auction.id} 처리 중 예외:`, err);
        results.errors.push(`${auction.id}:${String(err)}`);
      }
    }

    console.log("📊 처리 완료:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Edge Function 실행 오류:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

// ---- 노쇼 알림톡 발송 ----

async function sendNoshowNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  strikeResult: unknown
): Promise<void> {
  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !TPL_NOSHOW_BANNED) return;

  const { data: user } = await supabase
    .from("users")
    .select("phone, name, strike_count, blocked_until")
    .eq("id", userId)
    .single();

  if (!user?.phone) return;

  let penaltyStatus = "";
  if (user.blocked_until) {
    const bannedDate = new Date(user.blocked_until).toLocaleDateString("ko-KR");
    penaltyStatus = `이용 정지: ${bannedDate}까지`;
  } else if (user.strike_count >= 4) {
    penaltyStatus = "영구 이용 정지";
  } else {
    penaltyStatus = `${user.strike_count}회 누적 (${4 - user.strike_count}회 남음)`;
  }

  try {
    await solapiSendAlimtalk(user.phone, TPL_NOSHOW_BANNED, {
      userName: user.name || "회원",
      strikeCount: String(user.strike_count),
      penaltyStatus,
    });

    await supabase.from("notification_logs").insert({
      event_type: "noshow_penalty",
      auction_id: "00000000-0000-0000-0000-000000000000", // no specific auction
      recipient_user_id: userId,
      recipient_phone: user.phone,
      template_id: TPL_NOSHOW_BANNED,
      status: "sent",
    });
  } catch (err) {
    console.error(`❌ 노쇼 알림톡 발송 실패 (${userId}):`, err);
  }
}

// ---- 차순위 낙찰 알림톡 발송 ----

async function sendFallbackWonNotification(
  supabase: ReturnType<typeof createClient>,
  auctionId: string,
  newWinnerId: string,
  vars: { clubName: string; winningPrice: string; contactDeadline: string; auctionUrl: string }
): Promise<void> {
  // FALLBACK_WON 템플릿이 있으면 사용, 없으면 AUCTION_WON으로 대체
  const templateId = TPL_FALLBACK_WON || TPL_AUCTION_WON;
  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !templateId) return;

  const { data: winner } = await supabase
    .from("users")
    .select("phone, name")
    .eq("id", newWinnerId)
    .single();

  if (!winner?.phone) return;

  try {
    if (TPL_FALLBACK_WON) {
      await solapiSendAlimtalk(winner.phone, TPL_FALLBACK_WON, {
        clubName: vars.clubName,
        userName: winner.name || "회원",
        winningPrice: vars.winningPrice,
        contactDeadline: vars.contactDeadline,
        auctionUrl: vars.auctionUrl,
      });
    } else {
      // FALLBACK_WON 템플릿 미등록 시 AUCTION_WON으로 대체
      await solapiSendAlimtalk(winner.phone, TPL_AUCTION_WON!, {
        clubName: vars.clubName,
        winningPrice: vars.winningPrice,
        contactDeadline: vars.contactDeadline,
        auctionUrl: vars.auctionUrl,
      });
    }

    await supabase.from("notification_logs").insert({
      event_type: "fallback_won",
      auction_id: auctionId,
      recipient_user_id: newWinnerId,
      recipient_phone: winner.phone,
      template_id: templateId,
      status: "sent",
    });

    console.log(`📨 차순위 낙찰 알림 발송: ${auctionId} → ${winner.phone}`);
  } catch (err) {
    console.error(`❌ 차순위 낙찰 알림톡 발송 실패 (${newWinnerId}):`, err);
  }
}

// ---- 인앱 알림 생성 ----

async function createInAppNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  notification: { type: string; title: string; message: string; action_url: string }
): Promise<void> {
  try {
    await supabase.from("in_app_notifications").insert({
      user_id: userId,
      ...notification,
    });
  } catch (err) {
    console.error(`⚠️ 인앱 알림 생성 실패 (${userId}):`, err);
  }
}

// ---- SOLAPI REST API (Deno 호환) ----

async function solapiSendAlimtalk(
  to: string,
  templateId: string,
  vars: Record<string, string>
): Promise<void> {
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
            templateId,
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
