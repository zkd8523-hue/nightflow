import { create } from "zustand";
import type { Auction, Bid } from "@/types/database";

interface AuctionState {
  // 현재 보고 있는 경매
  currentAuction: Auction | null;
  bids: Bid[];

  // 액션
  setCurrentAuction: (auction: Auction | null) => void;
  updateAuction: (partial: Partial<Auction>) => void;
  setBids: (bids: Bid[]) => void;
  addBid: (bid: Bid) => void;
}

export const useAuctionStore = create<AuctionState>((set) => ({
  currentAuction: null,
  bids: [],

  setCurrentAuction: (currentAuction) => set({ currentAuction }),

  updateAuction: (partial) =>
    set((state) => ({
      currentAuction: state.currentAuction
        ? { ...state.currentAuction, ...partial }
        : null,
    })),

  setBids: (bids) => set({ bids }),

  addBid: (bid) =>
    set((state) => {
      // 중복 방지: 동일 bid_amount + bidder_id 조합이 이미 있으면 무시
      // (Realtime과 optimistic update 동시 도착 대비)
      const isDuplicate = state.bids.some(
        (b) => b.id === bid.id ||
          (b.bidder_id === bid.bidder_id && b.bid_amount === bid.bid_amount && b.auction_id === bid.auction_id)
      );
      if (isDuplicate) return state;
      return { bids: [bid, ...state.bids] };
    }),
}));
