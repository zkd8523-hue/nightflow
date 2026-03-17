"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

/**
 * 경매 시작 알림 훅
 * Supabase Realtime으로 경매 status 변경을 감지하여
 * scheduled → active 전환 시 toast + 진동으로 알림
 */
export function useAuctionStartNotify(auctionId: string, enabled: boolean = false) {
    useEffect(() => {
        if (!enabled || !auctionId) return;

        const supabase = createClient();

        const channel = supabase.channel(`auction-start-${auctionId}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "auctions",
                    filter: `id=eq.${auctionId}`
                },
                (payload) => {
                    const updated = payload.new;

                    if (updated.status === "active") {
                        if (typeof window !== "undefined" && window.navigator?.vibrate) {
                            window.navigator.vibrate([200, 100, 200]);
                        }

                        toast.success("경매가 시작되었습니다! 지금 입찰하세요", {
                            duration: 8000,
                            position: "top-center",
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [auctionId, enabled]);
}
