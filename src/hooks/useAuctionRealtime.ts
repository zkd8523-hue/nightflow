"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuctionStore } from "@/stores/useAuctionStore";
import { logger } from "@/lib/utils/logger";
import type { Bid } from "@/types/database";
import dayjs from "dayjs";

import { toast } from "sonner";
import { formatPrice } from "@/lib/utils/format";

/**
 * 경매 상세 페이지 실시간 동기화 훅
 *
 * place_bid()가 SECURITY DEFINER로 실행되어 Supabase Realtime이
 * INSERT/UPDATE 이벤트를 전달하지 않으므로, 폴링 방식으로 동기화합니다.
 *
 * 최적화:
 * - Page Visibility API: 비활성 탭에서 폴링 완전 중지
 * - 적응형 폴링 주기: 경매 상태에 따라 1.5초~15초 동적 조절
 */

const POLL_ACTIVE = 3000;       // 진행 중: 3초
const POLL_ENDING_SOON = 1500;  // 마감 임박 (5분 이내): 1.5초
const POLL_INACTIVE = 15000;    // 종료/미시작: 15초

function getPollingInterval(auction: { status: string; extended_end_at?: string; auction_end_at: string } | null): number {
  if (!auction) return POLL_ACTIVE;

  if (auction.status === "active") {
    const endTime = auction.extended_end_at || auction.auction_end_at;
    const remaining = dayjs(endTime).diff(dayjs(), "second");
    if (remaining <= 0) return POLL_INACTIVE;
    if (remaining <= 300) return POLL_ENDING_SOON;
    return POLL_ACTIVE;
  }

  // scheduled, won, unsold 등 비활성 상태
  if (auction.status === "scheduled") return POLL_ACTIVE;
  return POLL_INACTIVE;
}

export function useAuctionRealtime(auctionId: string, userId?: string) {
  const { updateAuction, addBid } = useAuctionStore();
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBidCountRef = useRef<number>(0);
  const updateAuctionRef = useRef(updateAuction);
  const addBidRef = useRef(addBid);

  // ref를 최신 상태로 유지 (useEffect 의존성에서 제외하기 위함)
  useEffect(() => {
    updateAuctionRef.current = updateAuction;
  }, [updateAuction]);

  useEffect(() => {
    addBidRef.current = addBid;
  }, [addBid]);

  useEffect(() => {
    const supabase = createClient();

    // 초기 상태 설정
    const state = useAuctionStore.getState();
    lastBidCountRef.current = state.currentAuction?.bid_count || 0;

    const poll = async () => {
      try {
        // 1. 경매 최신 상태 조회
        const { data: auction } = await supabase
          .from("auctions")
          .select("*")
          .eq("id", auctionId)
          .single();

        if (!auction) return null;

        const prevBidCount = lastBidCountRef.current;
        lastBidCountRef.current = auction.bid_count || 0;

        // 경매 상태 업데이트
        updateAuctionRef.current(auction);

        // 2. bid_count가 변했을 때만 입찰 기록 조회
        if (auction.bid_count !== prevBidCount) {
          const { data: recentBids } = await supabase
            .from("bids")
            .select("*, bidder:users(id, name, profile_image)")
            .eq("auction_id", auctionId)
            .order("bid_at", { ascending: false })
            .limit(10);

          if (recentBids && recentBids.length > 0) {
            const currentBids = useAuctionStore.getState().bids;
            const lastHighestBidderId = currentBids.length > 0 ? currentBids[0].bidder_id : null;

            // 전역 Store에 입찰 내역 추가
            for (const bid of recentBids) {
              addBidRef.current(bid as Bid);
            }

            // Outbid 체크: 내가 최고 입찰자였다가 밀려난 경우
            const newHighestBid = recentBids[0];
            if (userId && lastHighestBidderId === userId && newHighestBid.bidder_id !== userId) {
              // 진동
              if (typeof window !== "undefined" && window.navigator?.vibrate) {
                window.navigator.vibrate([200, 100, 200]);
              }

              toast.error(
                `다른 유저가 ${formatPrice(newHighestBid.bid_amount)}으로 입찰했습니다!`,
                {
                  description: "재입찰하여 경쟁에 참여하세요",
                  duration: 8000,
                  position: "top-center",
                }
              );
            }
          }
        }

        return auction;
      } catch (err) {
        logger.error("[Polling] 조회 실패:", err);
        return null;
      }
    };

    // 재귀 setTimeout으로 적응형 폴링 구현
    const scheduleNext = (lastAuction: { status: string; extended_end_at?: string; auction_end_at: string } | null) => {
      const interval = getPollingInterval(lastAuction);
      pollingRef.current = setTimeout(async () => {
        const auction = await poll();
        scheduleNext(auction);
      }, interval);
    };

    const stopPolling = () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };

    // Page Visibility API: 비활성 탭에서 폴링 중지
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // 탭 복귀 시 즉시 1회 폴링 + 스케줄 재시작
        poll().then(auction => scheduleNext(auction));
      } else {
        stopPolling();
      }
    };

    // 즉시 1회 실행 + 스케줄 시작
    poll().then(auction => scheduleNext(auction));
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [auctionId, userId]);
}
