import { redirect } from "next/navigation";
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

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) redirect("/login");

    // 1. 입찰 내역 조회 (기존)
    const { data: bids, error } = await supabase
        .from("bids")
        .select(`
            *,
            auction:auctions (
                *,
                club:clubs (*)
            )
        `)
        .eq("bidder_id", authUser.id)
        .order("bid_at", { ascending: false });

    if (error) {
        logger.error("Error fetching bids:", error);
    }

    // 경매 ID별로 최신 입찰 하나만 필터링
    const latestBidsByAuction = bids ? Array.from(
        bids.reduce((map, bid) => {
            if (!map.has(bid.auction_id)) {
                map.set(bid.auction_id, bid);
            }
            return map;
        }, new Map()).values()
    ) : [];

    // 2. 낙찰 데이터 조회 (my-wins 로직 이관)
    const { data: wonBids, error: wonBidsError } = await supabase
        .from("bids")
        .select(`
            *,
            auction:auctions (
                *,
                club:clubs (*),
                md:md_id (name, phone, instagram, kakao_open_chat_url, preferred_contact_methods)
            )
        `)
        .eq("bidder_id", authUser.id)
        .eq("status", "won")
        .order("bid_at", { ascending: false });

    const { data: winnerAuctions, error: winnerError } = await supabase
        .from("auctions")
        .select(`
            *,
            club:club_id (*),
            md:md_id (name, phone, instagram, kakao_open_chat_url, preferred_contact_methods)
        `)
        .eq("winner_id", authUser.id)
        .order("won_at", { ascending: false });

    if (wonBidsError) logger.error("Error fetching won bids:", wonBidsError);
    if (winnerError) logger.error("Error fetching winner auctions:", winnerError);

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

    // 3. 오늘특가 대화 내역 조회
    const { data: chatInterests, error: interestError } = await supabase
        .from("chat_interests")
        .select(`
            *,
            auction:auctions (
                *,
                club:clubs (*)
            )
        `)
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });

    if (interestError) {
        logger.error("Error fetching chat interests:", interestError);
    }

    // MD 미응답 신고 이력
    const { data: existingReports } = await supabase
        .from("md_unresponsive_reports")
        .select("auction_id")
        .eq("reporter_id", authUser.id);
    const reportedAuctionIds = new Set(existingReports?.map(r => r.auction_id) || []);

    // 4. 내 퍼즐 조회 (대표자이거나 참여자인 퍼즐)
    const { data: leaderPuzzles } = await supabase
        .from("puzzles")
        .select("*")
        .eq("leader_id", authUser.id)
        .order("created_at", { ascending: false });

    const { data: memberPuzzleIds } = await supabase
        .from("puzzle_members")
        .select("puzzle_id")
        .eq("user_id", authUser.id);

    const memberIds = (memberPuzzleIds || []).map(m => m.puzzle_id);
    const leaderIds = new Set((leaderPuzzles || []).map(p => p.id));

    let memberPuzzles: Puzzle[] = [];
    if (memberIds.length > 0) {
        const { data } = await supabase
            .from("puzzles")
            .select("*")
            .in("id", memberIds.filter(id => !leaderIds.has(id)))
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
            userId={authUser.id}
            initialTab={params.tab}
            initialPuzzles={myPuzzles}
        />
    );
}
