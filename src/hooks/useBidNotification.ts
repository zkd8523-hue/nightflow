"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";

export function useBidNotification(auctionIds: string[], enabled: boolean = true) {
    useEffect(() => {
        if (!enabled || auctionIds.length === 0) return;

        const supabase = createClient();
        const subscribeToAuctions = async () => {
            // 여러 경매를 하나의 채널에서 구독하기엔 filter(or) 조건이 한계가 있을 수 있으므로
            // IN 필터 처리가 가능하면 IN, 아니면 별도 채널
            // 여기서는 MVP 단계이므로, 각 auction_id마다 채널을 생성하여 구독

            const channels = auctionIds.map(auctionId => {
                return supabase.channel(`bid-notify-${auctionId}`)
                    .on(
                        "postgres_changes",
                        {
                            event: "INSERT",
                            schema: "public",
                            table: "bids",
                            filter: `auction_id=eq.${auctionId}`
                        },
                        (payload) => {
                            const newBid = payload.new;
                            // 진동 API (모바일 지원시)
                            if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
                                window.navigator.vibrate([200, 100, 200]);
                            }

                            toast.success(`새로운 입찰이 들어왔습니다: ${formatPrice(newBid.bid_amount)}`, {
                                description: "가장 높은 금액으로 입찰되었습니다.",
                                duration: 5000,
                                position: "top-center"
                            });
                        }
                    )
                    .subscribe();
            });

            return () => {
                channels.forEach(channel => supabase.removeChannel(channel));
            };
        };

        let cleanupFn: (() => void) | undefined;

        subscribeToAuctions().then(fn => {
            cleanupFn = fn;
        });

        return () => {
            if (cleanupFn) cleanupFn();
        };

    }, [auctionIds.join(","), enabled]); // auctionIds 배열이 바뀔 때만 재구독
}
