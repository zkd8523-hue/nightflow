"use client";

import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";
import { Zap } from "lucide-react";

// 모듈 레벨 캐시: 경매 ID → 클럽 이름 (TTL 1분)
const auctionCache = new Map<string, { clubName: string; cachedAt: number }>();
const CACHE_TTL = 60_000;

export function GlobalBidFeed() {
    const supabase = useMemo(() => createClient(), []);

    useEffect(() => {
        const channel = supabase
            .channel("global-bid-feed")
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "bids",
                },
                async (payload) => {
                    const newBid = payload.new;
                    const auctionId = newBid.auction_id;

                    try {
                        // 캐시 확인
                        const cached = auctionCache.get(auctionId);
                        if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
                            showBidToast(cached.clubName, newBid.bid_amount);
                            return;
                        }

                        // 캐시 미스: DB 조회
                        const { data: auction } = await supabase
                            .from("auctions")
                            .select("id, club:clubs(name)")
                            .eq("id", auctionId)
                            .single();

                        if (auction) {
                            const clubData = auction as unknown as { id: string; club: { name: string } | null };
                            const clubName = clubData.club?.name || "클럽";

                            // 캐시에 저장
                            auctionCache.set(auctionId, { clubName, cachedAt: Date.now() });
                            showBidToast(clubName, newBid.bid_amount);
                        }
                    } catch {
                        // 입찰 피드 정보 조회 실패 (무시)
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase]);

    return null; // UI 없이 로직만 수행
}

function showBidToast(clubName: string, bidAmount: number) {
    toast(
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-white fill-white" />
            </div>
            <div className="space-y-0.5">
                <p className="text-[13px] font-black text-white">
                    새로운 입찰!
                </p>
                <p className="text-[11px] text-neutral-400">
                    {clubName} 클럽에 {formatPrice(bidAmount)} 입찰 발생
                </p>
            </div>
        </div>,
        {
            position: "top-center",
            duration: 4000,
        }
    );
}
