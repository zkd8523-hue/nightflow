"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AuctionStatus } from "@/types/database";
import { logger } from "@/lib/utils/logger";

const POLL_INTERVAL = 5000;

export interface AuctionUpdate {
  id: string;
  current_bid: number;
  bid_count: number;
  bidder_count: number;
  status: AuctionStatus;
  winner_id: string | null;
  extended_end_at: string | null;
  auction_end_at: string;
}

/**
 * 다중 경매 상태 폴링 훅
 * active 경매만 5초 간격으로 폴링하여 current_bid/status 변경 감지
 */
export function useMyBidsRealtime(
  auctionIds: string[],
  onUpdate: (auctions: AuctionUpdate[]) => void
) {
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevDataRef = useRef<Map<string, { current_bid: number; status: string }>>(new Map());
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const idsKey = auctionIds.join(",");

  useEffect(() => {
    if (auctionIds.length === 0) {
      prevDataRef.current.clear();
      return;
    }

    const supabase = createClient();

    const poll = async () => {
      try {
        const { data: auctions } = await supabase
          .from("auctions")
          .select("id, current_bid, bid_count, bidder_count, status, winner_id, extended_end_at, auction_end_at")
          .in("id", auctionIds);

        if (!auctions) return;

        const changed = auctions.filter((a) => {
          const prev = prevDataRef.current.get(a.id);
          if (!prev) return true;
          return prev.current_bid !== a.current_bid || prev.status !== a.status;
        });

        if (changed.length > 0) {
          onUpdateRef.current(changed as AuctionUpdate[]);
        }

        for (const a of auctions) {
          prevDataRef.current.set(a.id, {
            current_bid: a.current_bid,
            status: a.status,
          });
        }
      } catch (err) {
        logger.error("[MyBids Polling] error:", err);
      }
    };

    poll();
    pollingRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [idsKey]);
}
