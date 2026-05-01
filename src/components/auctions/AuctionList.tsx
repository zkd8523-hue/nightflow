"use client";

import { useState, useMemo } from "react";
import type { Auction, Puzzle } from "@/types/database";
import { AuctionCard } from "./AuctionCard";
import { PuzzleList } from "@/components/puzzles/PuzzleList";
import { isAuctionActive, getEffectiveEndTime } from "@/lib/utils/auction";
import { getClubEventDate } from "@/lib/utils/date";
import { DateGroup } from "@/components/ui/DateGroup";
import { isInstantEnabled } from "@/lib/features";
import { MAIN_AREAS } from "@/lib/constants/areas";
import { MapPin, ChevronDown, ChevronUp } from "lucide-react";


interface AuctionListProps {
  activeAuctions: Auction[];
  puzzles?: Puzzle[];
  puzzleOfferCounts?: Record<string, number>;
  selectedArea?: string | null;
  onAreaChange?: (area: string | null) => void;
  userBidMap?: Map<string, number>;
  userInterestedSet?: Set<string>;
  userRole?: "user" | "md" | "admin";
  initialTab?: "today" | "advance" | "puzzle";
  onTabChange?: (tab: "today" | "advance" | "puzzle") => void;
  onShowGuide?: () => void;
}

export function AuctionList({ activeAuctions: initialAuctions, puzzles = [], puzzleOfferCounts = {}, selectedArea, onAreaChange, userBidMap, userInterestedSet, userRole, initialTab, onTabChange, onShowGuide }: AuctionListProps) {
  const [areaExpanded, setAreaExpanded] = useState(false);
  const handleAreaSelect = (area: string | null) => {
    onAreaChange?.(area);
    setAreaExpanded(false);
  };
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

  const instantEnabled = isInstantEnabled();

  // 경매가 있는 탭을 기본으로 선택 (instant off일 때 today 후보 제외)
  const [tab, setTabRaw] = useState<"today" | "advance" | "puzzle">(() => {
    if (initialTab && (initialTab !== "today" || instantEnabled)) return initialTab;
    if (instantEnabled && todayAuctions.length > 0) return "today";
    if (advanceAuctions.length > 0) return "advance";
    return "puzzle";
  });

  const setTab = (t: "today" | "advance" | "puzzle") => {
    setTabRaw(t);
    onTabChange?.(t);
  };

  // 퍼즐: 지역 필터 적용
  const filteredPuzzles = selectedArea
    ? puzzles.filter((p) => p.area === selectedArea)
    : puzzles;

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
      <div className="flex items-center gap-2 px-1">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide flex-1 min-w-0">
          <button
            onClick={() => setTab("puzzle")}
            className={`text-[13px] font-bold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${tab === "puzzle"
              ? "bg-amber-500 text-black"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
          >
            ⛳ 깃발 {filteredPuzzles.length > 0 && `(${filteredPuzzles.length})`}
          </button>

          <button
            onClick={() => setTab("advance")}
            className={`text-[13px] font-bold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${tab === "advance"
              ? "bg-amber-500 text-black"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
          >
            📅 얼리버드 경매 {advanceAuctions.length > 0 && `(${advanceAuctions.length})`}
          </button>

          {instantEnabled && (
            <button
              onClick={() => setTab("today")}
              className={`text-[13px] font-bold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${tab === "today"
                ? "bg-amber-500 text-black"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
            >
              🔥 오늘특가 {todayAuctions.length > 0 && `(${todayAuctions.length})`}
            </button>
          )}
        </div>

        {onShowGuide && tab === "puzzle" && (
          <button
            onClick={onShowGuide}
            className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors flex-shrink-0 whitespace-nowrap"
          >
            <span className="text-[13px]">ⓘ</span>
            깃발이란?
          </button>
        )}
      </div>

      {/* 지역 필터 — 기본 접힘, 탭하면 가로 펼침 */}
      {onAreaChange && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1 pb-1">
          <button
            onClick={() => setAreaExpanded((v) => !v)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${
              selectedArea
                ? "bg-white text-black"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            <MapPin className="w-3 h-3" />
            {selectedArea ?? "지역 선택"}
            {areaExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <div
            className={`flex gap-2 overflow-hidden transition-all duration-300 ease-out ${
              areaExpanded ? "max-w-[600px] opacity-100" : "max-w-0 opacity-0"
            }`}
          >
            <button
              onClick={() => handleAreaSelect(null)}
              className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                selectedArea === null
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
            >
              전체
            </button>
            {MAIN_AREAS.map((area) => (
              <button
                key={area}
                onClick={() => handleAreaSelect(area)}
                className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                  selectedArea === area
                    ? "bg-white text-black"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </div>
      )}

      {instantEnabled && tab === "today" && (
        <div>
          {todayAuctions.length === 0 ? (
            <div className="text-center pt-8 pb-16 space-y-6">
              {userRole === "md" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-[15px] font-bold text-neutral-300">테이블이 비었나요?</p>
                    <p className="text-[12px] text-neutral-500 leading-relaxed">
                      지금 당장 수익으로 전환해보세요!
                    </p>
                  </div>
                  <a
                    href="/md/auctions/new"
                    className="inline-block px-6 py-2.5 bg-white text-black text-[13px] font-black rounded-full"
                  >
                    10초 만에 오늘특가 등록하기
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[15px] font-bold text-neutral-300">오늘특가가 곧 올라옵니다</p>
                  <p className="text-[12px] text-neutral-500 leading-relaxed">
                    MD가 오늘 특가를 올리면
                    <br />
                    빠르게 잡을 수 있어요.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {sortedInstantDates.map((date, dateIndex) => (
                <DateGroup key={date} date={date} showCount>
                  {groupedInstant[date].map((auction, cardIndex) => (
                    <AuctionCard key={auction.id} auction={auction} userBidAmount={userBidMap?.get(auction.id)} isUserInterested={userInterestedSet?.has(auction.id)} priority={dateIndex === 0 && cardIndex === 0} />
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
                  {closingToday.map((auction, cardIndex) => (
                    <AuctionCard key={auction.id} auction={auction} userBidAmount={userBidMap?.get(auction.id)} priority={cardIndex === 0} />
                  ))}
                </DateGroup>
              )}
              {sortedAdvanceDates.map((date, dateIndex) => (
                <DateGroup key={date} date={date} showCount>
                  {groupedAdvance[date].map((auction, cardIndex) => (
                    <AuctionCard key={auction.id} auction={auction} userBidAmount={userBidMap?.get(auction.id)} priority={closingToday.length === 0 && dateIndex === 0 && cardIndex === 0} />
                  ))}
                </DateGroup>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "puzzle" && (
        <PuzzleList
          puzzles={filteredPuzzles}
          userRole={userRole}
          offerCounts={puzzleOfferCounts}
        />
      )}

    </div>
  );
}
