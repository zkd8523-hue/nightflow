import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MyBidsClient } from "@/components/auctions/MyBidsClient";
import type { BidWithAuction } from "@/components/auctions/MyBidCard";
import type { WonAuctionData, ChatInterestWithAuction } from "@/components/auctions/MyBidsClient";
import type { Puzzle } from "@/types/database";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

interface PageProps {
    searchParams: Promise<{ tab?: string }>;
}

export default async function MyBidsPage({ searchParams }: PageProps) {
    const supabase = await createClient();
    const params = await searchParams;

    // 미들웨어가 이미 auth.getUser()를 완료하고 x-user-id 헤더로 전달 → 재호출 생략
    const headersList = await headers();
    let userId = headersList.get("x-user-id");
    if (!userId) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) redirect("/login");
        userId = authUser.id;
    }

    // 서로 독립적인 7개 쿼리를 병렬 실행 (memberPuzzles만 결과 의존이라 이후 단계)
    const [
        { data: bids, error },
        { data: wonBids, error: wonBidsError },
        { data: winnerAuctions, error: winnerError },
        { data: chatInterests, error: interestError },
        { data: existingReports },
        { data: leaderPuzzles },
        { data: memberPuzzleIds },
    ] = await Promise.all([
        // 1. 입찰 내역
        supabase
            .from("bids")
            .select(`
                *,
                auction:auctions (
                    *,
                    club:clubs (*)
                )
            `)
            .eq("bidder_id", userId)
            .order("bid_at", { ascending: false })
            .limit(200),
        // 2-a. 낙찰 입찰
        supabase
            .from("bids")
            .select(`
                *,
                auction:auctions (
                    *,
                    club:clubs (*),
                    md:md_id (name, phone, instagram, kakao_open_chat_url, preferred_contact_methods)
                )
            `)
            .eq("bidder_id", userId)
            .eq("status", "won")
            .order("bid_at", { ascending: false })
            .limit(100),
        // 2-b. 낙찰 경매 (winner_id 기준)
        supabase
            .from("auctions")
            .select(`
                *,
                club:club_id (*),
                md:md_id (name, phone, instagram, kakao_open_chat_url, preferred_contact_methods)
            `)
            .eq("winner_id", userId)
            .order("won_at", { ascending: false })
            .limit(100),
        // 3. 오늘특가 대화 내역
        supabase
            .from("chat_interests")
            .select(`
                *,
                auction:auctions (
                    *,
                    club:clubs (*)
                )
            `)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(100),
        // MD 미응답 신고 이력
        supabase
            .from("md_unresponsive_reports")
            .select("auction_id")
            .eq("reporter_id", userId),
        // 4-a. 대표자 퍼즐 (수락 오퍼 MD 프로필 포함)
        supabase
            .from("puzzles")
            .select(`
                *,
                accepted_offer:puzzle_offers!fk_puzzles_accepted_offer(
                    id, table_type, proposed_price, includes, comment,
                    club:clubs(id, name, area),
                    md:public_user_profiles!puzzle_offers_md_id_fkey(
                        id, display_name, profile_image, md_deal_count,
                        instagram, phone, kakao_open_chat_url, preferred_contact_methods
                    )
                )
            `)
            .eq("leader_id", userId)
            .order("created_at", { ascending: false }),
        // 4-b. 참여 퍼즐 ID
        supabase
            .from("puzzle_members")
            .select("puzzle_id")
            .eq("user_id", userId),
    ]);

    if (error) logger.error("Error fetching bids:", error);
    if (wonBidsError) logger.error("Error fetching won bids:", wonBidsError);
    if (winnerError) logger.error("Error fetching winner auctions:", winnerError);
    if (interestError) logger.error("Error fetching chat interests:", interestError);

    // 경매 ID별로 최신 입찰 하나만 필터링
    const latestBidsByAuction = bids ? Array.from(
        bids.reduce((map, bid) => {
            if (!map.has(bid.auction_id)) {
                map.set(bid.auction_id, bid);
            }
            return map;
        }, new Map()).values()
    ) : [];

    // 이중 소스 병합 (auction_id 기준 중복 제거)
    const auctionMap = new Map<string, WonAuctionData>();

    if (wonBids) {
        for (const bid of wonBids) {
            if (bid.auction && !auctionMap.has(bid.auction_id)) {
                auctionMap.set(bid.auction_id, bid.auction as WonAuctionData);
            }
        }
    }

    if (winnerAuctions) {
        for (const auction of winnerAuctions) {
            if (!auctionMap.has(auction.id)) {
                auctionMap.set(auction.id, auction as WonAuctionData);
            }
        }
    }

    const allWonAuctions = Array.from(auctionMap.values())
        .sort((a, b) => new Date(b.won_at || b.updated_at).getTime() - new Date(a.won_at || a.updated_at).getTime());

    const reportedAuctionIds = new Set(existingReports?.map(r => r.auction_id) || []);

    // 참여 퍼즐 조회 (대표자 퍼즐 제외) — memberPuzzleIds 결과에 의존하므로 이후 단계
    const memberIds = (memberPuzzleIds || []).map(m => m.puzzle_id);
    const leaderIds = new Set((leaderPuzzles || []).map(p => p.id));

    let memberPuzzles: Puzzle[] = [];
    const filteredMemberIds = memberIds.filter(id => !leaderIds.has(id));
    if (filteredMemberIds.length > 0) {
        const { data } = await supabase
            .from("puzzles")
            .select("*")
            .in("id", filteredMemberIds)
            .order("created_at", { ascending: false });
        memberPuzzles = (data || []) as Puzzle[];
    }

    const myPuzzles = [...(leaderPuzzles || []), ...memberPuzzles] as Puzzle[];

    return (
        <MyBidsClient
            initialBids={latestBidsByAuction as BidWithAuction[]}
            initialWonAuctions={allWonAuctions}
            initialChatInterests={(chatInterests || []) as ChatInterestWithAuction[]}
            reportedAuctionIds={[...reportedAuctionIds]}
            userId={userId}
            initialTab={params.tab}
            initialPuzzles={myPuzzles}
        />
    );
}
