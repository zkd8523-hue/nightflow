"use client";

import { memo } from "react";
import { Flame } from "lucide-react";
import type { Bid } from "@/types/database";

interface BidCompetitionIndicatorProps {
  bids: Bid[];
  remaining: number;
}

/**
 * 입찰 경쟁 상황 표시 컴포넌트
 *
 * 조건:
 * - 1분 이하 + 입찰자 3명 이상일 때 표시
 * - 고유 입찰자 수 계산 (bids.length가 아닌 unique bidder_id)
 * - FOMO 유발을 위한 심리적 트리거
 */
export const BidCompetitionIndicator = memo(function BidCompetitionIndicator({ bids, remaining }: BidCompetitionIndicatorProps) {
  // 고유 입찰자 수 계산
  const uniqueBidders = new Set(bids.map(b => b.bidder_id)).size;

  // 1분 이하 + 3명 이상만 표시
  if (remaining > 60 || uniqueBidders < 3) return null;

  return (
    <div className="px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
      <p className="text-sm text-red-400 font-bold text-center">
        <Flame className="w-4 h-4 inline-block mr-1" />
        {uniqueBidders}명 경쟁 중! 낙찰 임박
      </p>
    </div>
  );
});
