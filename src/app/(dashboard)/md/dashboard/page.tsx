import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MDDashboard } from "@/components/md/MDDashboard";

import type { User, Auction, Club, DailyHotdeal, HotdealBenefitsByDow, ShareOption, ShareWeekdayPlan } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function MDDashboardPage({ searchParams }: { searchParams: Promise<{ test?: string; section?: string }> }) {
    const supabase = await createClient();
    const isDev = process.env.NODE_ENV === "development";
    const sp = await searchParams;
    const testMode = isDev && sp.test === "true";
    const initialSection = sp.section ?? null;

    let userId: string;
    let userData: User | null = null;

    if (testMode) {
        // 테스트 모드 (개발 환경 전용)
        userId = '00000000-0000-0000-0000-000000000002';
        const { data } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .single();
        userData = data;
    } else {
        // 미들웨어가 이미 auth.getUser() + users 조회를 완료하고 헤더로 전달
        const headersList = await headers();
        const headerUserId = headersList.get("x-user-id");

        if (!headerUserId) {
            // 헤더 없으면 미들웨어를 통과 못 한 것 (직접 접근 등) → 재검증
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) redirect("/login");
            userId = user.id;
        } else {
            userId = headerUserId;
        }

        const { data } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .single();
        userData = data;

        if (!userData) redirect("/");

        // 정지 기간 만료 시 자동 해제
        if (
            userData.md_status === "suspended" &&
            userData.md_suspended_until &&
            new Date(userData.md_suspended_until) < new Date()
        ) {
            await supabase
                .from("users")
                .update({ md_status: "approved", md_suspended_until: null })
                .eq("id", userId);
            userData = { ...userData, md_status: "approved", md_suspended_until: null } as User;
        }
    }

    // 3. 데이터가 없는 경우를 위한 목업 데이터 (테스트 모드용)
    if (testMode && !userData) {
        userData = {
            id: userId,
            name: "테스트파트너",
            role: "md",
            md_unique_slug: "test-md-1234",
        } as User;
    }

    if (!userData) {
        return (
            <div className="p-20 text-white bg-[#0A0A0A] min-h-screen text-center">
                <h2 className="text-xl font-bold mb-4">로그인이 필요하거나 권한이 없습니다.</h2>
                <p className="text-neutral-500">파트너 계정으로 로그인해주세요.</p>
            </div>
        );
    }

    // 4. MD의 클럽 목록 조회 — Migration 177(club_partners) 기반
    //    auctions 조회보다 먼저: 파트너 클럽 ID로 매물도 필터링.
    const [{ data: clubsRaw }, { data: hotdealClubsRaw }] = await Promise.all([
        supabase
            .from("clubs")
            .select("*, club_partners!inner(md_id)")
            .eq("club_partners.md_id", userId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false }),
        supabase
            .from("clubs")
            .select("id, name, area, thumbnail_url, floor_plan_url, floor_plan_urls, club_partners!inner(md_id)")
            .eq("club_partners.md_id", userId)
            .is("deleted_at", null)
            .order("name"),
    ]);

    // UI에서 club_partners 필드 안 쓰니 제거 (Club 타입 호환)
    const clubs = (clubsRaw ?? []).map(({ club_partners: _, ...rest }) => rest) as Club[];
    const hotdealClubs = (hotdealClubsRaw ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        area: c.area,
        thumbnail_url: c.thumbnail_url,
        floor_plan_url: c.floor_plan_url,
        // 대표 테이블맵 1장 (다중 등록 시 첫 장, 없으면 레거시 단일)
        floor_plan_main:
            (c as { floor_plan_urls?: string[] | null }).floor_plan_urls?.[0] ??
            c.floor_plan_url ??
            null,
    }));

    // 5. MD의 경매 목록 조회
    // 본인 매물 OR 파트너 클럽 매물 — 같은 클럽 다른 MD가 올린 매물도 보이게
    const partnerClubIds = clubs.map(c => c.id);
    let auctionsQuery = supabase
        .from("auctions")
        .select(`
      id, md_id, club_id, status, listing_type, title, table_info,
      start_price, current_bid, bid_count, seats_claimed, external_attendees,
      total_seats, price_per_seat, created_at, event_date, auction_start_at,
      auction_end_at, extended_end_at, contact_deadline, thumbnail_url, includes,
      chat_interest_count, buy_now_price, winner_id, cancel_type, cancel_reason,
      share_date, share_option_id, share_deadline, today_view_count,
      club:club_id (id, name, area, thumbnail_url, is_test)
    `)
        .order("created_at", { ascending: false });

    if (partnerClubIds.length > 0) {
        auctionsQuery = auctionsQuery.or(
            `md_id.eq.${userId},club_id.in.(${partnerClubIds.join(",")})`
        );
    } else {
        auctionsQuery = auctionsQuery.eq("md_id", userId);
    }

    // 주 계산 (슬롯 쿼리에 필요)
    const kstNowForSlot = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const dowSlot = kstNowForSlot.getUTCDay();
    const daysFromMon = dowSlot === 0 ? 6 : dowSlot - 1;
    const mondayKst = new Date(kstNowForSlot);
    mondayKst.setUTCDate(kstNowForSlot.getUTCDate() - daysFromMon);
    mondayKst.setUTCHours(0, 0, 0, 0);
    const thisWeekISO = mondayKst.toISOString().slice(0, 10);
    const nextWeekDate = new Date(mondayKst);
    nextWeekDate.setUTCDate(mondayKst.getUTCDate() + 7);
    const nextWeekISO = nextWeekDate.toISOString().slice(0, 10);

    const slotClubIds = hotdealClubs.map((c) => c.id);

    // 나머지 쿼리 모두 병렬
    const [
        { data: auctions },
        { data: puzzleOffers, error: puzzleOffersError },
        { data: myHotdeals },
        { data: slotRows },
        { data: mySlotRows },
        { data: shareSlotRows },
    ] = await Promise.all([
        auctionsQuery,
        supabase
            .from("puzzle_offers")
            .select(`
                *,
                puzzle:puzzles!puzzle_offers_puzzle_id_fkey (
                    id, area, event_date, total_budget, budget_per_person,
                    target_count, current_count, status, kakao_open_chat_url,
                    is_recruiting_party, leader_id
                )
            `)
            .eq("md_id", userId)
            .in("status", ["pending", "accepted"])
            .order("created_at", { ascending: false }),
        supabase
            .from("daily_hotdeals")
            .select("*, club:clubs(id, name, area, thumbnail_url)")
            .eq("md_id", userId)
            .neq("status", "expired")
            .order("created_at", { ascending: false })
            .limit(20),
        slotClubIds.length
            ? supabase
                  .from("weekly_hotdeal_slots")
                  .select("id, club_id, md_id, week_start, benefits_by_dow, expires_at")
                  .in("club_id", slotClubIds)
                  .in("week_start", [thisWeekISO, nextWeekISO])
            : Promise.resolve({ data: [] as { id: string; club_id: string; md_id: string; week_start: string; benefits_by_dow: unknown; expires_at: string }[], error: null }),
        supabase
            .from("weekly_hotdeal_slots")
            .select("id, club_id, week_start, benefits_by_dow, expires_at")
            .eq("md_id", userId)
            .gte("week_start", thisWeekISO)
            .lte("week_start", nextWeekISO),
        slotClubIds.length
            ? supabase
                  .from("weekly_share_slots")
                  .select("id, club_id, md_id, week_start, expires_at")
                  .in("club_id", slotClubIds)
                  .eq("week_start", thisWeekISO)
            : Promise.resolve({ data: [] as { id: string; club_id: string; md_id: string; week_start: string; expires_at: string }[], error: null }),
    ]);

    if (puzzleOffersError) console.error("puzzleOffers query error:", puzzleOffersError);

    // 유저가 상담을 시작한(leader_chat_started_at) 대기중 오퍼 중, MD 본인이 이미 답장한 것 집합
    // → 대시보드 배지를 "대기중" / "유저가 답장을 기다리고 있어요" / "상담중" 으로 세분화
    const chatStartedPendingOfferIds = (puzzleOffers ?? [])
        .filter((o) => o.status === "pending" && o.leader_chat_started_at)
        .map((o) => o.id);
    let mdRepliedOfferIds: string[] = [];
    if (chatStartedPendingOfferIds.length > 0) {
        const { data: mdReplies } = await supabase
            .from("puzzle_offer_messages")
            .select("offer_id")
            .eq("sender_id", userId)
            .in("offer_id", chatStartedPendingOfferIds);
        mdRepliedOfferIds = Array.from(new Set((mdReplies ?? []).map((m) => m.offer_id)));
    }

    // 5. 활성 경매의 최고 입찰자 조회
    const activeIds = (auctions || []).filter(a => a.status === "active").map(a => a.id);
    const topBids: Record<string, { bidder_name: string; bid_amount: number }> = {};

    if (activeIds.length > 0) {
        const { data: bids } = await supabase
            .from("bids")
            .select("auction_id, bid_amount, bidder:users!bids_bidder_id_fkey(display_name)")
            .in("auction_id", activeIds)
            .eq("status", "active")
            .order("bid_amount", { ascending: false });

        for (const bid of (bids || [])) {
            if (!topBids[bid.auction_id]) {
                const bidData = bid as unknown as { auction_id: string; bid_amount: number; bidder?: { display_name: string } | null };
                topBids[bid.auction_id] = {
                    bidder_name: bidData.bidder?.display_name || "익명",
                    bid_amount: bidData.bid_amount,
                };
            }
        }
    }

    const guestSignSlots = (slotRows ?? []).map((s) => ({
        id: s.id,
        club_id: s.club_id,
        md_id: s.md_id,
        week_start: s.week_start,
        benefits_by_dow: (s.benefits_by_dow ?? {}) as HotdealBenefitsByDow,
        expires_at: s.expires_at,
    }));
    const guestSignMySlots = (mySlotRows ?? []).map((s) => ({
        id: s.id,
        club_id: s.club_id,
        week_start: s.week_start,
        benefits_by_dow: (s.benefits_by_dow ?? {}) as HotdealBenefitsByDow,
        expires_at: s.expires_at,
    }));

    const shareSlots = (shareSlotRows ?? []).map((s) => ({
        id: s.id,
        club_id: s.club_id,
        md_id: s.md_id,
        week_start: s.week_start,
        expires_at: s.expires_at,
    }));

    // 8-c. 내가 선점 중인 클럽의 조각 옵션 + 요일표 (상시 세팅 UI용)
    const myClaimedShareClubIds = shareSlots.filter((s) => s.md_id === userId).map((s) => s.club_id);
    const [{ data: shareOptionRows }, { data: shareWeekdayPlanRows }] = await Promise.all([
        myClaimedShareClubIds.length
            ? supabase
                  .from("share_options")
                  .select("*")
                  .eq("md_id", userId)
                  .in("club_id", myClaimedShareClubIds)
                  .order("sort_order", { ascending: true })
                  .order("created_at", { ascending: true })
            : Promise.resolve({ data: [] as ShareOption[], error: null }),
        myClaimedShareClubIds.length
            ? supabase
                  .from("share_weekday_plan")
                  .select("*")
                  .eq("md_id", userId)
                  .in("club_id", myClaimedShareClubIds)
            : Promise.resolve({ data: [] as ShareWeekdayPlan[], error: null }),
    ]);
    const shareOptions = (shareOptionRows ?? []) as ShareOption[];
    const shareWeekdayPlans = (shareWeekdayPlanRows ?? []) as ShareWeekdayPlan[];

    // 테스트 모드일 때 경매가 하나도 없으면 샘플 하나 추가 (상태 확인용)
    const displayAuctions = (testMode && (!auctions || auctions.length === 0)) ? [
        {
            id: "sample-1",
            title: "강남 OCTAGON 테이블",
            status: "active",
            current_bid: 250000,
            start_price: 180000,
            bid_count: 5,
            auction_end_at: new Date(Date.now() + 3600000).toISOString(),
            club: { name: "OCTAGON", area: "강남" }
        } as unknown as Auction
    ] : (auctions || []) as unknown as Auction[];

    return (
        <div className="min-h-screen bg-[#0A0A0A]">
            <MDDashboard
                user={userData}
                initialSection={initialSection}
                initialAuctions={displayAuctions}
                initialClubs={clubs || []}
                initialTopBids={topBids}
                initialPuzzleOffers={puzzleOffers || []}
                mdRepliedOfferIds={mdRepliedOfferIds}
                hotdealClubs={hotdealClubs}
                initialMyHotdeals={(myHotdeals ?? []) as unknown as DailyHotdeal[]}
                guestSignClubs={hotdealClubs.map((c) => ({
                    id: c.id,
                    name: c.name,
                    area: c.area,
                    thumbnail_url: c.thumbnail_url,
                }))}
                guestSignSlots={guestSignSlots}
                guestSignMySlots={guestSignMySlots}
                guestSignThisWeekISO={thisWeekISO}
                guestSignNextWeekISO={nextWeekISO}
                shareSlotClubs={hotdealClubs.map((c) => ({
                    id: c.id,
                    name: c.name,
                    area: c.area,
                    thumbnail_url: c.thumbnail_url,
                    floor_plan_url: c.floor_plan_main,
                }))}
                shareSlots={shareSlots}
                shareSlotThisWeekISO={thisWeekISO}
                shareOptions={shareOptions}
                shareWeekdayPlans={shareWeekdayPlans}
            />
        </div>
    );
}
