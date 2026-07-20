"use client";

import { memo } from "react";
import { formatPrice, formatNumber } from "@/lib/utils/format";

interface CurrentBidDisplayProps {
  amount: number;
  bidderCount: number;
  isMinimal?: boolean;
  isHighestBidder?: boolean;
  isOutbid?: boolean;
  isInstant?: boolean;
}

export const CurrentBidDisplay = memo(function CurrentBidDisplay({
  amount,
  bidderCount,
  isMinimal = false,
  isHighestBidder = false,
  isOutbid = false,
  isInstant = false,
}: CurrentBidDisplayProps) {
  if (isMinimal) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline font-black text-foreground tracking-tighter leading-none">
          <span className="text-[42px]">{formatNumber(amount)}</span>
          <span className="text-[24px] ml-0.5 font-bold">원</span>
        </div>
        {!isInstant && (
          <div className="flex items-center gap-1.5 text-[13px] font-bold">
            {isHighestBidder && (
              <span className="text-money bg-green-500/10 px-2 py-0.5 rounded-full text-[11px]">최고 입찰</span>
            )}
            {isOutbid && (
              <span className="text-brand-amber bg-amber-500/10 px-2 py-0.5 rounded-full text-[11px] font-bold">추월됨</span>
            )}
            {bidderCount > 0 && <span className="text-muted-foreground">참여자 {bidderCount}명</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card/50 border border-border/50 rounded-lg p-6 text-center space-y-3">
      <p className="text-sm text-muted-foreground">{isInstant ? "예약가" : bidderCount === 0 ? "시작가" : "현재 최고 입찰가"}</p>
      <p className="text-4xl font-black text-foreground">{formatPrice(amount)}</p>
      {!isInstant && (
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          {isHighestBidder && (
            <span className="text-money bg-green-500/10 px-2.5 py-0.5 rounded-full text-[12px] font-bold">최고 입찰</span>
          )}
          {isOutbid && (
            <span className="text-brand-amber bg-amber-500/10 px-2.5 py-0.5 rounded-full text-[12px] font-bold">추월됨</span>
          )}
          {bidderCount > 0 && <span>참여자 {bidderCount}명</span>}
        </div>
      )}
    </div>
  );
});
