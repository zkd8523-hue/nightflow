"use client";

import { useState, useMemo } from "react";
import type { Auction } from "@/types/database";
import { AuctionCard } from "./AuctionCard";
import { isAuctionActive, getEffectiveEndTime } from "@/lib/utils/auction";
import { getClubEventDate } from "@/lib/utils/date";
import { DateGroup } from "@/components/ui/DateGroup";


interface AuctionListProps {
  activeAuctions: Auction[];
  selectedArea?: string | null;
  userBidMap?: Map<string, number>;
  userInterestedSet?: Set<string>;
}

export function AuctionList({ activeAuctions: initialAuctions, selectedArea, userBidMap, userInterestedSet }: AuctionListProps) {
  const filterByArea = (auctions: Auction[]) => {
    if (!selectedArea) return auctions;
    return auctions.filter(a => a.club?.area === selectedArea);
  };

  const liveAndUpcoming = [...filterByArea(initialAuctions)].sort((a, b) => {
    const aActive = isAuctionActive(a);
    const bActive = isAuctionActive(b);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;

    if (aActive && bActive) {
      // 둘 다 LIVE: 마감 임박순 → 입찰 많은 순 (밴드왜건 효과)
      const aEnd = new Date(getEffectiveEndTime(a)).getTime();
      const bEnd = new Date(getEffectiveEndTime(b)).getTime();
      if (aEnd !== bEnd) return aEnd - bEnd;
      return (b.bid_count || 0) - (a.bid_count || 0);
    }

    // 둘 다 Scheduled: 시작 시간 가까운 순
    return new Date(a.auction_start_at).getTime() - new Date(b.auction_start_at).getTime();
  });

  const todayDate = getClubEventDate();
  // 오늘특가: listing_type === 'instant' (예약가)
  const todayAuctions = liveAndUpcoming.filter(a => a.listing_type === 'instant');
  // 얼리버드 경매: listing_type === 'auction' (경매)
  const advanceAuctions = liveAndUpcoming.filter(a => a.listing_type === 'auction');

  // 경매가 있는 탭을 기본으로 선택
  const [tab, setTab] = useState<"today" | "advance">(() => {
    if (todayAuctions.length > 0) return "today";
    if (advanceAuctions.length > 0) return "advance";
    return "today";
  });

  // 오늘특가: 날짜별 그룹핑
  const { groupedInstant, sortedInstantDates } = useMemo(() => {
    const grouped = todayAuctions.reduce((groups, auction) => {
      const date = auction.event_date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(auction);
      return groups;
    }, {} as Record<string, typeof todayAuctions>);
    const sorted = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
    return { groupedInstant: grouped, sortedInstantDates: sorted };
  }, [todayAuctions]);

  // 얼리버드: "오늘 마감" + 미래 날짜별 그룹핑
  const { closingToday, groupedAdvance, sortedAdvanceDates } = useMemo(() => {
    // 오늘 마감 (event_date === todayDate인 얼리버드)
    const closing = advanceAuctions.filter(a => a.event_date === todayDate);

    // 나머지 미래 날짜 — 날짜별 그룹핑
    const future = advanceAuctions.filter(a => a.event_date !== todayDate);
    const grouped = future.reduce((groups, auction) => {
      const date = auction.event_date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(auction);
      return groups;
    }, {} as Record<string, typeof future>);

    const sorted = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
    return { closingToday: closing, groupedAdvance: grouped, sortedAdvanceDates: sorted };
  }, [advanceAuctions, todayDate]);


  return (
    <div className="space-y-2.5">
      <div className="flex gap-2 px-1 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setTab("today")}
            className={`text-[13px] font-bold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${tab === "today"
              ? "bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)] border border-amber-400"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
          >
            🔥 오늘특가 {todayAuctions.length > 0 && `(${todayAuctions.length})`}
          </button>

          <button
            onClick={() => setTab("advance")}
            className={`text-[13px] font-bold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${tab === "advance"
              ? "bg-white text-black"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
          >
            📅 얼리버드 경매 {advanceAuctions.length > 0 && `(${advanceAuctions.length})`}
          </button>

        </div>

      {tab === "today" && (
        <div>
          {todayAuctions.length === 0 ? (
            <div className="text-center pt-8 pb-16 space-y-6">
              <div className="space-y-2">
                <p className="text-[15px] font-bold text-neutral-300">오늘특가가 곧 올라옵니다</p>
                <p className="text-[12px] text-neutral-500 leading-relaxed">
                  MD가 예약가격 테이블을 올리면
                  <br />
                  선착순으로 예약할 수 있어요.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {sortedInstantDates.map(date => (
                <DateGroup key={date} date={date} showCount>
                  {groupedInstant[date].map(auction => (
                    <AuctionCard key={auction.id} auction={auction} userBidAmount={userBidMap?.get(auction.id)} isUserInterested={userInterestedSet?.has(auction.id)} />
                  ))}
                </DateGroup>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "advance" && (
        <div>
          {advanceAuctions.length === 0 ? (
            <div className="text-center pt-8 pb-16 space-y-6">
              <div className="space-y-2">
                <p className="text-[15px] font-bold text-neutral-300">아직 등록된 얼리버드 경매가 없어요</p>
                <p className="text-[12px] text-neutral-500 leading-relaxed">
                  주말 인기 클럽은 미리 경매가 열립니다.
                  <br />
                  자주 확인하면 좋은 자리를 선점할 수 있어요.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {closingToday.length > 0 && (
                <DateGroup date={todayDate} showCount label="마감임박">
                  {closingToday.map(auction => (
                    <AuctionCard key={auction.id} auction={auction} userBidAmount={userBidMap?.get(auction.id)} />
                  ))}
                </DateGroup>
              )}
              {sortedAdvanceDates.map(date => (
                <DateGroup key={date} date={date} showCount>
                  {groupedAdvance[date].map(auction => (
                    <AuctionCard key={auction.id} auction={auction} userBidAmount={userBidMap?.get(auction.id)} />
                  ))}
                </DateGroup>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
