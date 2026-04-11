import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MDDashboard } from "@/components/md/MDDashboard";

import type { User, Auction } from "@/types/database";

export default async function MDDashboardPage({ searchParams }: { searchParams: Promise<{ test?: string }> }) {
    const supabase = await createClient();
    const isDev = process.env.NODE_ENV === "development";
    const testMode = isDev && (await searchParams).test === "true";

    let userId: string;
    let userData: User | null = null;

    if (testMode) {
        // 1. 테스트 모드 (개발 환경 전용)
        userId = '00000000-0000-0000-0000-000000000002';
        const { data } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .single();
        userData = data;
    } else {
        // 1. 일반 모드: 세션 확인
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) redirect("/login");

        userId = user.id;
        const { data } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .single();
        userData = data;

        // 미들웨어에서 이미 role 체크를 완료했으므로, 여기서는 데이터 존재 여부만 확인
        if (!userData) {
            redirect("/");
        }

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
            name: "테스트MD",
            role: "md",
            md_unique_slug: "test-md-1234",
        } as User;
    }

    if (!userData) {
        return (
            <div className="p-20 text-white bg-[#0A0A0A] min-h-screen text-center">
                <h2 className="text-xl font-bold mb-4">로그인이 필요하거나 권한이 없습니다.</h2>
                <p className="text-neutral-500">MD 계정으로 로그인해주세요.</p>
            </div>
        );
    }

    // 4. MD의 경매 목록 조회
    const { data: auctions } = await supabase
        .from("auctions")
        .select(`
      *,
      club:club_id (*)
    `)
        .eq("md_id", userId)
        .order("created_at", { ascending: false });

    // 5. 활성 경매의 최고 입찰자 조회
    const activeIds = (auctions || []).filter(a => a.status === "active").map(a => a.id);
    const topBids: Record<string, { bidder_name: string; bid_amount: number }> = {};

    if (activeIds.length > 0) {
        const { data: bids } = await supabase
            .from("bids")
            .select("auction_id, bid_amount, bidder:users!bids_bidder_id_fkey(name)")
            .in("auction_id", activeIds)
            .eq("status", "active")
            .order("bid_amount", { ascending: false });

        for (const bid of (bids || [])) {
            if (!topBids[bid.auction_id]) {
                const bidData = bid as unknown as { auction_id: string; bid_amount: number; bidder?: { name: string } | null };
                topBids[bid.auction_id] = {
                    bidder_name: bidData.bidder?.name || "익명",
                    bid_amount: bidData.bid_amount,
                };
            }
        }
    }

    // 6. MD의 클럽 목록 조회
    const { data: clubs } = await supabase
        .from("clubs")
        .select("*")
        .eq("md_id", userId)
        .order("created_at", { ascending: false });

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
    ] : (auctions || []) as Auction[];

    return (
        <div className="min-h-screen bg-[#0A0A0A]">
            <MDDashboard
                user={userData}
                initialAuctions={displayAuctions}
                initialClubs={clubs || []}
                initialTopBids={topBids}
            />
        </div>
    );
}
