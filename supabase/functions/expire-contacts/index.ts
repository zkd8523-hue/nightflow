// Deno Edge Function: 연락 마감 처리
// Cron: 매 1분 (* * * * *)
//
// [Case 1] status='won' + contact_deadline < now → MD에게 "연락받으셨나요?" 알림
//   스트라이크/차순위는 MD가 명시적으로 노쇼 신고 시에만 부과 (opt-out)
//
// [Case 2] fallback_deadline < now (차순위 수락 시간 만료) → 다음 차순위 탐색
//   패널티 없음, fallback_to_next_bidder() 재호출

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { solapiSendAlimtalk } from "../_shared/solapi.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIXPANEL_TOKEN = Deno.env.get("NEXT_PUBLIC_MIXPANEL_TOKEN");

async function trackMixpanelEvent(eventName: string, props: Record<string, unknown>) {
  if (!MIXPANEL_TOKEN) return;
  try {
    const payload = [{
      event: eventName,
      properties: {
        token: MIXPANEL_TOKEN,
        distinct_id: (props.md_id as string) || "server",
        time: Math.floor(Date.now() / 1000),
        ...props,
      },
    }];
    const encoded = btoa(JSON.stringify(payload));
    await fetch(`https://api.mixpanel.com/track?data=${encodeURIComponent(encoded)}`);
  } catch { /* 무시 */ }
}

// 알림톡 템플릿 ID (SOLAPI 자체 환경변수는 _shared/solapi.ts 내부에서 읽음)
const TPL_MD_NOSHOW_CHECK = Deno.env.get("ALIMTALK_TPL_MD_NOSHOW_CHECK");
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

    console.log("🔍 연락 마감 / 차순위 수락 마감 초과 경매 검색...");

    const now = new Date().toISOString();

    // ── Case 1: status='won' + contact_deadline 만료 ──
    // instant는 연락 타이머 없음
    const { data: expiredContacts, error: fetchError } = await supabase
      .from("auctions")
      .select("id, winner_id, winning_price, contact_timer_minutes, md_id, listing_type, club:clubs(name)")
      .eq("status", "won")
      .neq("listing_type", "instant")
      .not("contact_deadline", "is", null)
      .lt("contact_deadline", now);

    if (fetchError) {
      console.error("❌ 경매 조회 실패:", fetchError);
      throw fetchError;
    }

    // ── Case 2: fallback_deadline 만료 (차순위 수락 시간 초과) ───────────────
    const { data: expiredFallbacks, error: fbFetchError } = await supabase
      .from("auctions")
      .select("id, fallback_offered_to, md_id, club:clubs(name)")
      .not("fallback_offered_to", "is", null)
      .not("fallback_deadline", "is", null)
      .lt("fallback_deadline", now);

    if (fbFetchError) {
      console.error("❌ fallback 만료 경매 조회 실패:", fbFetchError);
    }

    const totalItems = (expiredContacts?.length || 0) + (expiredFallbacks?.length || 0);

    if (totalItems === 0) {
      console.log("✅ 처리할 만료 경매 없음");
      return new Response(
        JSON.stringify({ success: true, count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📦 연락만료 ${expiredContacts?.length || 0}건, fallback 만료 ${expiredFallbacks?.length || 0}건`);

    const results = {
      total: totalItems,
      noshow_notified: 0,   // MD에게 "연락받으셨나요?" 알림 발송
      fallback_offers: 0,
      fallback_expired_next: 0,
      unsold: 0,
      errors: [] as string[],
    };

    // ── Case 1 처리: 연락 타이머 만료 — MD에게 "연락받으셨나요?" 알림 ──
    // 스트라이크/차순위는 MD가 명시적으로 "노쇼 신고" 클릭 시에만 부과 (opt-out)
    for (const auction of (expiredContacts || [])) {
      try {
        const clubName = (auction.club as unknown as { name: string })?.name || "클럽";

        // contact_deadline 초기화 (재트리거 방지)
        await supabase
          .from("auctions")
          .update({ contact_deadline: null })
          .eq("id", auction.id);

        // MD에게 인앱 알림
        if (auction.md_id) {
          await createInAppNotification(supabase, auction.md_id, {
            type: "md_noshow_review",
            title: "낙찰자에게 연락받으셨나요?",
            message: `${clubName} 경매 낙찰자의 연락 시간이 만료되었습니다. 연락을 못 받으셨다면 노쇼 신고를 해주세요.`,
            action_url: `/md/transactions`,
          });

          // MD 알림톡 (템플릿 설정 시)
          if (TPL_MD_NOSHOW_CHECK) {
            const { data: mdUser } = await supabase
              .from("users").select("phone, name").eq("id", auction.md_id).single();
            if (mdUser?.phone) {
              try {
                await solapiSendAlimtalk(mdUser.phone, TPL_MD_NOSHOW_CHECK, {
                  mdName: mdUser.name || "MD",
                  clubName,
                  transactionsUrl: `${APP_URL}/md/transactions`,
                });
              } catch (err) {
                console.error(`⚠️ MD 알림톡 발송 실패 (${auction.id}):`, err);
              }
            }
          }
        }

        results.noshow_notified++;

        await trackMixpanelEvent("auction_contact_expired", {
          auction_id: auction.id,
          md_id: auction.md_id,
        });
      } catch (err) {
        console.error(`❌ 경매 ${auction.id} 처리 중 예외:`, err);
        results.errors.push(`${auction.id}:${String(err)}`);
      }
    }

    // ── Case 2 처리: fallback 수락 시간 만료 ────────────────────────────────
    for (const auction of (expiredFallbacks || [])) {
      try {
        const clubName = (auction.club as unknown as { name: string })?.name || "클럽";
        console.log(`⏰ fallback 수락 만료: 경매 ${auction.id}, 대상 ${auction.fallback_offered_to}`);

        // 패널티 없이 다음 차순위 탐색
        // decline_fallback과 유사하지만 bid를 cancelled로 전환하지 않음 (미응답이므로)
        // → fallback_offered_to 초기화 후 fallback_to_next_bidder() 재호출

        // 미응답자 bid를 cancelled 처리 (재등장 방지)
        await supabase.from("bids")
          .update({ status: "cancelled" })
          .eq("auction_id", auction.id)
          .eq("bidder_id", auction.fallback_offered_to)
          .eq("status", "outbid");

        // fallback 초기화
        await supabase.from("auctions")
          .update({
            fallback_offered_to: null,
            fallback_offered_at: null,
            fallback_deadline: null,
          })
          .eq("id", auction.id);

        // 다음 차순위 탐색
        const { data: nextFbResult, error: nextFbError } = await supabase.rpc(
          "fallback_to_next_bidder",
          { p_auction_id: auction.id }
        );

        if (nextFbError) {
          console.error(`❌ 다음 차순위 탐색 실패 (${auction.id}):`, nextFbError.message);
          results.errors.push(`next_fallback:${auction.id}:${nextFbError.message}`);
          continue;
        }

        const nextResult = nextFbResult as unknown as { result: string; offered_to?: string };

        if (nextResult?.result === "fallback_offered") {
          results.fallback_expired_next++;
          console.log(`✅ 다음 차순위 제안: 경매 ${auction.id} → ${nextResult.offered_to}`);
        } else {
          results.unsold++;
          console.log(`📭 더 이상 차순위 없음 → unsold: 경매 ${auction.id}`);

          if (auction.md_id) {
            await createInAppNotification(supabase, auction.md_id, {
              type: "md_winner_noshow",
              title: "차순위 모두 만료 → 유찰",
              message: `${clubName} 경매의 모든 차순위 입찰자가 수락하지 않아 유찰되었습니다.`,
              action_url: `/md/transactions`,
            });
          }
        }

        // 미응답 차순위에게 인앱 알림 (참고용, 패널티 없음)
        if (auction.fallback_offered_to) {
          await createInAppNotification(supabase, auction.fallback_offered_to, {
            type: "contact_expired_no_fault",
            title: "차순위 낙찰 제안이 만료되었습니다",
            message: `${clubName} 경매의 차순위 수락 시간이 지나 다음 순위자에게 넘어갔습니다. 패널티는 없습니다.`,
            action_url: `/my-bids`,
          });
        }
      } catch (err) {
        console.error(`❌ fallback 만료 경매 ${auction.id} 처리 중 예외:`, err);
        results.errors.push(`fb_expire:${auction.id}:${String(err)}`);
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

