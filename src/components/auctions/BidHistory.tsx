"use client";

import { memo } from "react";
import type { Bid } from "@/types/database";
import { formatPrice } from "@/lib/utils/format";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface BidHistoryProps {
  bids: Bid[];
  currentBid?: number;
  vipUserIds?: string[];
  onBidderClick?: (bidderId: string) => void;
}

export const BidHistory = memo(function BidHistory({ bids, currentBid, vipUserIds, onBidderClick }: BidHistoryProps) {
  if (bids.length === 0) {
    return (
      <div className="text-center py-12 bg-neutral-900/30 rounded-3xl border border-dashed border-neutral-800/50">
        <p className="text-neutral-500 font-medium text-sm">아직 입찰 내역이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {bids.map((bid, index) => {
          const isHighest = index === 0 && bid.bid_amount === currentBid;
          const isBidderVip = vipUserIds?.includes(bid.bidder_id);

          return (
            <div
              key={bid.id}
              onClick={() => onBidderClick?.(bid.bidder_id)}
              className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${index === 0
                ? "bg-neutral-900/80 border-neutral-700/50 shadow-lg"
                : "bg-neutral-900/30 border-neutral-800/30"
                } ${onBidderClick ? "cursor-pointer hover:border-neutral-600" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-neutral-800 border flex items-center justify-center overflow-hidden ${isBidderVip ? "border-white/40" : "border-neutral-700"
                  }`}>
                  {bid.bidder?.profile_image ? (
                    <img
                      src={bid.bidder.profile_image}
                      alt={bid.bidder.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">
                      {bid.bidder?.name?.substring(0, 1) || "익"}
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-bold text-[14px] text-white flex items-center gap-1.5">
                    {bid.bidder?.name || "익명 입찰자"}
                    {isBidderVip && (
                      <span className="text-amber-500 text-[11px]" title="VIP">⭐</span>
                    )}
                  </p>
                  <p className="text-[11px] text-neutral-500 font-medium">
                    {dayjs(bid.bid_at).fromNow()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex flex-col items-end">
                  <p className={`font-black tracking-tight ${isHighest ? "text-white text-[18px]" : "text-neutral-300 text-[16px]"}`}>
                    {formatPrice(bid.bid_amount)}
                  </p>
                  {isHighest && (
                    <span className="text-[9px] font-black text-neutral-300 bg-neutral-800 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                      최고 입찰
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 깊은 비교: bids 배열과 currentBid가 동일하면 리렌더 방지
  return (
    prevProps.bids === nextProps.bids &&
    prevProps.currentBid === nextProps.currentBid &&
    prevProps.vipUserIds === nextProps.vipUserIds &&
    prevProps.onBidderClick === nextProps.onBidderClick
  );
});
