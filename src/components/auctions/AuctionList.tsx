"use client";

import { useState, useMemo, useEffect } from "react";
import type { Auction } from "@/types/database";
import { AuctionCard } from "./AuctionCard";
import { isAuctionActive, getEffectiveEndTime } from "@/lib/utils/auction";
import { getClubEventDate } from "@/lib/utils/date";
import { DateGroup } from "@/components/ui/DateGroup";
import { AreaNotifyBanner } from "@/components/home/AreaNotifyBanner";
import dayjs from "dayjs";
import "dayjs/locale/ko";

interface AuctionListProps {
  activeAuctions: Auction[];
  completedAuctions: Auction[];
  selectedArea?: string | null;
  userBidMap?: Map<string, number>;
}

export function AuctionList({ activeAuctions: initialAuctions, completedAuctions, selectedArea, userBidMap }: AuctionListProps) {
  const [now, setNow] = useState(() => dayjs());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(dayjs());
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const filterByArea = (auctions: Auction[]) => {
    if (!selectedArea) return auctions;
    return auctions.filter(a => a.club?.area === selectedArea);
  };

  // 클라이언트 시간 기준으로 만료된 경매는 종료 탭으로 이동
  const { stillActive, clientExpired } = useMemo(() => {
    const filtered = filterByArea(initialAuctions);
    return {
      stillActive: filtered.filter(a => now.isBefore(dayjs(getEffectiveEndTime(a)))),
      clientExpired: filtered.filter(a => !now.isBefore(dayjs(getEffectiveEndTime(a)))),
    };
  }, [now, initialAuctions, selectedArea]);

  const liveAndUpcoming = [...stillActive].sort((a, b) => {
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
  // 오늘 특가: listing_type === 'instant' (즉시구매)
  const todayAuctions = liveAndUpcoming.filter(a => a.listing_type === 'instant');
  // 얼리버드 경매: listing_type === 'auction' (경매)
  const advanceAuctions = liveAndUpcoming.filter(a => a.listing_type === 'auction');

  // 경매가 있는 탭을 기본으로 선택
  const [tab, setTab] = useState<"today" | "advance" | "completed">(() => {
    if (todayAuctions.length > 0) return "today";
    if (advanceAuctions.length > 0) return "advance";
    return "today";
  });

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

  const allCompleted = useMemo(
    () => [...clientExpired, ...filterByArea(completedAuctions)],
    [clientExpired, completedAuctions, selectedArea]
  );

  // 날짜별 그룹핑 및 정렬 (메모이제이션)
  const { groupedCompleted, sortedDates } = useMemo(() => {
    // 날짜별 그룹핑 (event_date 기준)
    const grouped = allCompleted.reduce((groups, auction) => {
      const date = auction.event_date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(auction);
      return groups;
    }, {} as Record<string, typeof allCompleted>);

    // 날짜 내림차순 정렬 (최신 먼저)
    const sorted = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    // 날짜 내 정렬: 낙찰 먼저, 유찰 나중
    for (const date of sorted) {
      grouped[date].sort((a, b) => {
        const priority = (s: string) => ["won", "contacted", "confirmed"].includes(s) ? 0 : 1;
        return priority(a.status) - priority(b.status);
      });
    }

    return { groupedCompleted: grouped, sortedDates: sorted };
  }, [allCompleted]);


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
            🔥 오늘 특가 {todayAuctions.length > 0 && `(${todayAuctions.length})`}
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

          <button
            onClick={() => setTab("completed")}
            className={`text-[13px] font-bold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 ${tab === "completed"
              ? "bg-white text-black"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
          >
            종료
          </button>
        </div>

      {tab === "today" && (
        <div>
          {todayAuctions.length === 0 ? (
            <div className="text-center pt-8 pb-16 space-y-6">
              <div className="space-y-2">
                <p className="text-[15px] font-bold text-neutral-300">오늘 특가가 곧 올라옵니다</p>
                <p className="text-[12px] text-neutral-500 leading-relaxed">
                  MD가 즉시구매 가능한 테이블을 올리면
                  <br />
                  선착순으로 구매할 수 있어요.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {todayAuctions.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} userBidAmount={userBidMap?.get(auction.id)} />
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
            <div className="space-y-2">
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

      {tab === "completed" && (
        <div>
          {allCompleted.length === 0 ? (
            <div className="text-center pt-8 pb-16 space-y-2">
              <p className="text-[15px] font-bold text-neutral-300">아직 종료된 경매가 없어요</p>
              <p className="text-[12px] text-neutral-500 leading-relaxed">
                첫 경매가 시작되면 여기서 결과를 확인할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedDates.map(date => (
                <DateGroup key={date} date={date}>
                  {groupedCompleted[date].map(auction => (
                    <AuctionCard key={auction.id} auction={auction} />
                  ))}
                </DateGroup>
              ))}
            </div>
          )}
        </div>
      )}

      {((tab === "today" && todayAuctions.length === 0) ||
        (tab === "advance" && advanceAuctions.length === 0)) && (
        <AreaNotifyBanner selectedArea={selectedArea ?? null} variant="empty-state" />
      )}
    </div>
  );
}
