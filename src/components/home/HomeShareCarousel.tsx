"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AuctionCard } from "@/components/auctions/AuctionCard";
import type { Auction } from "@/types/database";
import { getDDayLabel } from "@/lib/utils/format";

function formatEventDateLabel(eventDate: string): string {
  const d = new Date(eventDate + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

interface Props {
  shares: Auction[];
  userBidMap?: Record<string, number>;
  userInterestedSet?: Set<string>;
  currentUserId?: string;
  detailHref: string;
  newFlagHref?: string;
  userRole?: "user" | "md" | "admin";
}

const MAX_CARDS = 5;

export function HomeShareCarousel({
  shares,
  userBidMap = {},
  userInterestedSet,
  currentUserId,
  detailHref,
  newFlagHref,
  userRole,
}: Props) {
  if (shares.length === 0) {
    const isMdOrAdmin = userRole === "md" || userRole === "admin";
    if (isMdOrAdmin) {
      return (
        <div className="bg-[#1C1C1E] rounded-3xl p-6 text-center space-y-3 -mx-4">
          <p className="text-[15px] text-white font-bold">지금은 다른 조각이 없어요!</p>
          <p className="text-[12px] text-neutral-500">
            경쟁 조각이 없어서 유저 시선 독차지
          </p>
          <Link
            href="/md/auctions/new?type=share"
            className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-green-500 hover:bg-green-400 text-black text-[13px] font-black active:scale-95 transition"
          >
            🧩 조각 등록하기
          </Link>
        </div>
      );
    }
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
        className="flex items-stretch gap-3 overflow-x-auto scrollbar-hide snap-x snap-proximity touch-pan-x touch-pan-y pb-1 -mx-2 px-2"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
      >
        {visible.map((share) => {
          const dday = getDDayLabel(share.event_date);
          const isUrgent = dday === "오늘" || dday === "내일";
          const ddayMatch = dday.match(/^D-(\d+)$/);
          const showDday = isUrgent || (ddayMatch && parseInt(ddayMatch[1], 10) <= 3);
          return (
            <div
              key={share.id}
              className="flex-shrink-0 w-[88%] max-w-[420px] snap-start snap-always flex flex-col gap-2"
            >
              <div className="flex items-center gap-1.5 px-1">
                <div className="w-1 h-[14px] bg-green-500 rounded-full flex-shrink-0" />
                <h3 className="text-[18px] font-black text-white tracking-tight">
                  {formatEventDateLabel(share.event_date)}
                </h3>
                {showDday && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-px rounded-full mt-px ${
                      isUrgent ? "bg-red-500/20 text-red-400" : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {dday}
                  </span>
                )}
              </div>
              <AuctionCard
                auction={share}
                userBidAmount={userBidMap[share.id]}
                isUserInterested={userInterestedSet?.has(share.id)}
                currentUserId={currentUserId}
              />
            </div>
          );
        })}
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

    </div>
  );
}
