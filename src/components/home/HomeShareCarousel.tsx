"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AuctionCard } from "@/components/auctions/AuctionCard";
import type { Auction } from "@/types/database";

interface Props {
  shares: Auction[];
  userBidMap?: Record<string, number>;
  userInterestedSet?: Set<string>;
  currentUserId?: string;
  detailHref: string;
  newFlagHref?: string;
}

const MAX_CARDS = 5;

export function HomeShareCarousel({
  shares,
  userBidMap = {},
  userInterestedSet,
  currentUserId,
  detailHref,
  newFlagHref,
}: Props) {
  if (shares.length === 0) {
    return (
      <div className="bg-[#1C1C1E] rounded-3xl p-6 text-center -mx-4">
        <p className="text-[15px] text-white font-bold mb-3">아직 등록된 조각이 없어요</p>
        {newFlagHref && (
          <>
            <Link
              href={newFlagHref}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-amber-500 text-black text-[13px] font-black active:scale-95 transition"
            >
              ⛳ 내가 깃발 꽂기
            </Link>
            <p className="text-[11px] text-neutral-500 mt-1">
              MD들이 24시간 대기하고 있어요
            </p>
          </>
        )}
      </div>
    );
  }

  const visible = shares.slice(0, MAX_CARDS);
  const hasMore = shares.length > visible.length || visible.length === MAX_CARDS;

  return (
    <div>
      <div
        data-no-pull-refresh
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-proximity touch-pan-x pb-1 -mx-2 px-2"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
      >
        {visible.map((share) => (
          <div
            key={share.id}
            className="flex-shrink-0 w-[88%] max-w-[420px] snap-start snap-always"
          >
            <AuctionCard
              auction={share}
              userBidAmount={userBidMap[share.id]}
              isUserInterested={userInterestedSet?.has(share.id)}
              currentUserId={currentUserId}
            />
          </div>
        ))}
        {hasMore && (
          <div className="flex-shrink-0 w-[60%] max-w-[280px] snap-start snap-always">
            <Link
              href={detailHref}
              className="flex flex-col items-center justify-center h-full min-h-[200px] rounded-3xl border-2 border-dashed border-neutral-700 hover:border-amber-500/50 text-neutral-400 hover:text-white transition-colors px-4 py-8 gap-2"
            >
              <ChevronRight className="w-7 h-7" />
              <span className="text-[13px] font-bold text-center">
                자세히 보기
                <br />
                <span className="text-[10px] text-neutral-600">{shares.length}개 전체</span>
              </span>
            </Link>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center mt-1.5">
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-neutral-900 text-neutral-300 hover:bg-neutral-800 text-[12px] font-bold"
        >
          전체 보기
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
