import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { sendAlimtalkAndLog } from "@/lib/notifications/send-and-log";
import { ALIMTALK_TEMPLATES } from "@/lib/notifications/alimtalk";
import {
  isEarlybirdEndValid,
  isEventDateWithinWindow,
  EARLYBIRD_MAX_EVENT_DAYS_AHEAD,
} from "@/lib/utils/auction";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    // 1. 인증: ANON_KEY + 쿠키로 사용자 확인
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "인증이 필요합니다. 다시 로그인해주세요." },
        { status: 401 }
      );
    }

    // 2. Admin 클라이언트 (RLS 우회)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. 권한 확인: MD(approved) 또는 Admin만 허용
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("role, md_status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "사용자 정보를 찾을 수 없습니다" },
        { status: 403 }
      );
    }

    const isApprovedMD = profile.role === "md" && profile.md_status === "approved";
    const isAdmin = profile.role === "admin";

    if (!isApprovedMD && !isAdmin) {
      return NextResponse.json(
        { error: "경매 등록 권한이 없습니다. MD 승인이 필요합니다." },
        { status: 403 }
      );
    }

    // 4. 요청 데이터 파싱
    const body = await request.json();
    const { auctionData, isUpdate, auctionId } = body;

    if (!auctionData) {
      return NextResponse.json(
        { error: "경매 데이터가 없습니다" },
        { status: 400 }
      );
    }

    // md_id가 본인인지 확인
    if (auctionData.md_id !== user.id) {
      return NextResponse.json(
        { error: "본인의 경매만 등록할 수 있습니다" },
        { status: 403 }
      );
    }

    // 4-b. instant 모드 서버 측 강제 설정 (클라이언트 조작 방지)
    if (auctionData.listing_type === 'instant') {
      auctionData.buy_now_price = auctionData.start_price;
      auctionData.auto_extend_min = 0;
      auctionData.max_extensions = 0;
    }

    // 4-c. 얼리버드 타이밍 규칙 강제 (Migration 089)
    //      - event_date = 오늘 + 7일 이내 (슬라이딩 윈도우)
    //      - auction_end_at = KST 21:00 고정, 이벤트 -2일 이상 이전
    //      - auction_start_at = now() 서버 강제 (신규 등록만)
    if (auctionData.listing_type === 'auction') {
      if (!auctionData.event_date || !auctionData.auction_end_at) {
        return NextResponse.json(
          { error: "얼리버드 경매는 이벤트 날짜와 마감 시각이 필요합니다." },
          { status: 400 }
        );
      }
      // 신규 등록만 7일 윈도우 검증 (수정 시 기존 event_date는 보호됨)
      if (!isUpdate && !isEventDateWithinWindow(auctionData.event_date)) {
        return NextResponse.json(
          { error: `이벤트는 오늘부터 ${EARLYBIRD_MAX_EVENT_DAYS_AHEAD}일 이내여야 합니다.` },
          { status: 400 }
        );
      }
      if (!isEarlybirdEndValid(auctionData.event_date, auctionData.auction_end_at)) {
        return NextResponse.json(
          { error: "마감은 이벤트 -2일 이전 21:00이어야 합니다." },
          { status: 400 }
        );
      }
      // 신규 등록 시에만 auction_start_at을 서버 시각으로 강제
      // (수정 모드에서는 아래 protectedFields에서 auction_end_at가 이미 빠지므로 별도 처리 불필요)
      if (!isUpdate) {
        auctionData.auction_start_at = new Date().toISOString();
      }
    }

    // 5. 경매 등록 또는 수정
    if (isUpdate && auctionId) {
      // 입찰이 있으면 경매 조건 변경 차단 (서버 측 보호)
      const { data: existing } = await supabaseAdmin
        .from("auctions")
        .select("bid_count")
        .eq("id", auctionId)
        .single();

      if (existing && existing.bid_count > 0) {
        const protectedFields = [
          "start_price", "duration_minutes",
          "table_info", "includes", "club_id",
          "original_price", "reserve_price", "bid_increment", "auction_end_at",
          "listing_type", "buy_now_price",
        ];
        for (const field of protectedFields) {
          delete auctionData[field];
        }
      }

      const { error } = await supabaseAdmin
        .from("auctions")
        .update(auctionData)
        .eq("id", auctionId);

      if (error) {
        logger.error("Auction update error:", error);
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, id: auctionId });
    } else {
      const { data: newAuction, error } = await supabaseAdmin
        .from("auctions")
        .insert(auctionData)
        .select("id")
        .single();

      if (error) {
        logger.error("Auction create error:", error);
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      // Fire-and-forget: 지역 구독자에게 새 경매 알림 발송
      if (newAuction?.id) {
        sendAreaNotifications(
          supabaseAdmin,
          newAuction.id,
          auctionData.club_id,
          auctionData.title || "",
          user.id
        ).catch((err) => logger.error("Area notify error:", err));
      }

      return NextResponse.json({ success: true, id: newAuction?.id });
    }
  } catch (error) {
    logger.error("Create auction API error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

// ── 지역 구독자 알림 발송 (fire-and-forget) ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendAreaNotifications(
  supabase: { from: (table: string) => any },
  auctionId: string,
  clubId: string,
  auctionTitle: string,
  mdUserId: string
) {
  // 1. 클럽 지역 조회
  const { data: club } = await supabase
    .from("clubs")
    .select("area, name")
    .eq("id", clubId)
    .single();

  if (!club) return;

  // 2. 해당 지역 + "전체" 구독자 조회 (MD 본인 제외, 최대 50명)
  const { data: subscribers } = await supabase
    .from("area_notify_subscriptions")
    .select("user_id, phone, area")
    .or(`area.eq.${club.area},area.eq.전체`)
    .neq("user_id", mdUserId)
    .limit(50);

  if (!subscribers || subscribers.length === 0) return;

  // 3. 30분 쿨다운: 최근 30분 내 같은 유저에게 new_auction_in_area 발송 이력 확인
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const subscriberPhones = subscribers.map((s) => s.phone);

  const { data: recentLogs } = await supabase
    .from("notification_logs")
    .select("recipient_phone")
    .eq("event_type", "new_auction_in_area")
    .eq("status", "sent")
    .in("recipient_phone", subscriberPhones)
    .gte("created_at", thirtyMinAgo);

  const recentPhones = new Set(recentLogs?.map((l) => l.recipient_phone) || []);

  // 4. 쿨다운 통과한 구독자에게만 발송
  const auctionUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://nightflow.co").replace(/^https?:\/\//, "");

  const sendPromises = subscribers
    .filter((s) => !recentPhones.has(s.phone))
    .map((s) =>
      sendAlimtalkAndLog({
        eventType: "new_auction_in_area",
        auctionId,
        recipientUserId: s.user_id,
        recipientPhone: s.phone,
        templateId: ALIMTALK_TEMPLATES.NEW_AUCTION_IN_AREA,
        variables: {
          area: club.area,
          clubName: club.name,
          auctionTitle,
          auctionUrl,
        },
      })
    );

  await Promise.allSettled(sendPromises);
}
