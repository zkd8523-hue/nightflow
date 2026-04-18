// 낙찰 알림 발송 공유 모듈 (Deno Edge Function용)
// close-expired-auctions에서 경매 종료 후 낙찰자 + MD에게 알림톡 발송
//
// 기존 Next.js `/api/notifications/auction-won/route.ts`를 Deno로 포팅.
// 인앱 알림은 close_auction() DB 함수에서 이미 생성하므로, MD 인앱 + 알림톡만 처리.
//
// 환경변수:
//   ALIMTALK_TPL_AUCTION_WON  — 낙찰자용 템플릿
//   ALIMTALK_TPL_MD_NEW_MATCH — MD용 템플릿
//   NEXT_PUBLIC_APP_URL       — 알림톡 내 링크용 (프로토콜 제거)

import { solapiSendAlimtalk } from "./solapi.ts";

const APP_URL = (Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://nightflow.co").replace(/^https?:\/\//, "");
const TPL_AUCTION_WON = Deno.env.get("ALIMTALK_TPL_AUCTION_WON");
const TPL_MD_NEW_MATCH = Deno.env.get("ALIMTALK_TPL_MD_NEW_MATCH");

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export async function notifyAuctionWon(
  supabase: SupabaseClient,
  auctionId: string
): Promise<void> {
  // 1. 경매 정보 조회
  const { data: auction, error: auctionError } = await supabase
    .from("auctions")
    .select("winner_id, md_id, winning_price, table_info, event_date, contact_timer_minutes, club:clubs(name)")
    .eq("id", auctionId)
    .eq("status", "won")
    .single();

  if (auctionError || !auction?.winner_id) {
    console.log(`⏭️ 알림 스킵: 경매 ${auctionId}가 won 상태가 아니거나 낙찰자 없음`);
    return;
  }

  const clubName = (auction.club as { name: string })?.name || "클럽";
  const price = new Intl.NumberFormat("ko-KR").format(auction.winning_price || 0);
  const tableInfo = auction.table_info || "테이블";
  const contactMinutes = auction.contact_timer_minutes;
  const contactDeadline = contactMinutes ? `${contactMinutes}분 이내` : "제한 시간 내";

  // ─── 2. MD 알림 ───
  if (auction.md_id) {
    // MD 인앱 알림 (close_auction에서는 낙찰자 인앱만 생성하므로 MD 인앱은 여기서)
    try {
      await supabase.from("in_app_notifications").insert({
        user_id: auction.md_id,
        type: "auction_won",
        title: "새 낙찰이 발생했습니다!",
        message: `${clubName} ${tableInfo} | ${price}원 낙찰. 곧 고객이 연락합니다.`,
        action_url: `/md/transactions`,
      });
    } catch (err) {
      console.error(`⚠️ MD 인앱 알림 실패 (${auctionId}):`, err);
    }

    // MD 알림톡
    if (TPL_MD_NEW_MATCH) {
      const { data: md } = await supabase
        .from("users")
        .select("phone")
        .eq("id", auction.md_id)
        .single();

      if (md?.phone) {
        try {
          await sendAndLog(supabase, {
            eventType: "auction_won",
            auctionId,
            recipientUserId: auction.md_id,
            recipientPhone: md.phone,
            templateId: TPL_MD_NEW_MATCH,
            variables: {
              clubName,
              winningPrice: `${price}원`,
              auctionUrl: `${APP_URL}/auctions/${auctionId}`,
            },
          });
        } catch (err) {
          console.error(`⚠️ MD 알림톡 실패 (${auctionId}):`, err);
        }
      }
    }
  }

  // ─── 3. 낙찰자 알림톡 ───
  // 인앱 알림은 close_auction() DB 함수에서 이미 생성됨 → 알림톡만 발송
  if (!TPL_AUCTION_WON) {
    console.log(`⏭️ ALIMTALK_TPL_AUCTION_WON 미설정 — 낙찰자 알림톡 스킵`);
    return;
  }

  const { data: winner } = await supabase
    .from("users")
    .select("phone")
    .eq("id", auction.winner_id)
    .single();

  if (!winner?.phone) {
    console.log(`⏭️ 낙찰자 전화번호 없음 — 알림톡 스킵 (${auctionId})`);
    return;
  }

  try {
    await sendAndLog(supabase, {
      eventType: "auction_won",
      auctionId,
      recipientUserId: auction.winner_id,
      recipientPhone: winner.phone,
      templateId: TPL_AUCTION_WON,
      variables: {
        clubName,
        winningPrice: `${price}원`,
        contactDeadline,
        auctionUrl: `${APP_URL}/auctions/${auctionId}`,
      },
    });
    console.log(`✅ 낙찰 알림톡 발송 완료: 경매 ${auctionId}`);
  } catch (err) {
    console.error(`⚠️ 낙찰자 알림톡 실패 (${auctionId}):`, err);
  }
}

// ─── 중복 방지 + 로깅 래퍼 ───

interface SendAndLogParams {
  eventType: string;
  auctionId: string;
  recipientUserId: string;
  recipientPhone: string;
  templateId: string;
  variables: Record<string, string>;
}

async function sendAndLog(
  supabase: SupabaseClient,
  params: SendAndLogParams
): Promise<void> {
  // 중복 체크
  const { data: existing } = await supabase
    .from("notification_logs")
    .select("id")
    .eq("event_type", params.eventType)
    .eq("auction_id", params.auctionId)
    .eq("recipient_phone", params.recipientPhone)
    .eq("status", "sent")
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`⏭️ 중복 발송 방지: ${params.eventType} / ${params.auctionId}`);
    return;
  }

  try {
    await solapiSendAlimtalk(params.recipientPhone, params.templateId, params.variables);

    await supabase.from("notification_logs").insert({
      event_type: params.eventType,
      auction_id: params.auctionId,
      recipient_user_id: params.recipientUserId,
      recipient_phone: params.recipientPhone,
      template_id: params.templateId,
      status: "sent",
    });
  } catch (error) {
    console.error(`[sendAndLog] 발송 실패:`, error);

    await supabase.from("notification_logs").insert({
      event_type: params.eventType,
      auction_id: params.auctionId,
      recipient_user_id: params.recipientUserId,
      recipient_phone: params.recipientPhone,
      template_id: params.templateId,
      status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
