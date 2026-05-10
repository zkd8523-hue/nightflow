"use client";

import { useState, useMemo, useDeferredValue } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import type { Auction, Puzzle } from "@/types/database";
import { AuctionCard } from "./AuctionCard";
import { PuzzleList } from "@/components/puzzles/PuzzleList";
import { MyPuzzleResultsBanner } from "@/components/puzzles/MyPuzzleResultsBanner";
import { isAuctionActive, getEffectiveEndTime } from "@/lib/utils/auction";
import { getClubEventDate } from "@/lib/utils/date";
import { DateGroup } from "@/components/ui/DateGroup";
import { isInstantEnabled } from "@/lib/features";
import { MAIN_AREAS } from "@/lib/constants/areas";
import { matchesArea } from "@/lib/utils/area";
import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DateFilterCalendar } from "./filters/DateFilterCalendar";
import { PriceRangeFilter } from "./filters/PriceRangeFilter";
import {
  PRICE_MIN,
  PRICE_MAX,
  matchesDate,
  matchesPrice,
  isDefaultPriceRange,
  type DateFilter,
} from "@/lib/utils/auctionFilters";


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
  tabPromises?: Record<"today" | "advance" | "puzzle", { content: React.ReactNode; note?: React.ReactNode }>;
  guideSlot?: React.ReactNode;
}

export function AuctionList({ activeAuctions: initialAuctions, puzzles = [], puzzleOfferCounts = {}, selectedArea, onAreaChange, userBidMap, userInterestedSet, userRole, initialTab, onTabChange, onShowGuide, tabPromises, guideSlot }: AuctionListProps) {
  // Realtime 입찰 burst 시 필터 깜빡임 방지: deferred render
  const deferredAuctions = useDeferredValue(initialAuctions);

  // 얼리버드 추가 필터 (날짜·가격)
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const filterByArea = (auctions: Auction[]) => {
    if (!selectedArea) return auctions;
    return auctions.filter(a => matchesArea(a.club?.area, selectedArea));
  };

  const liveAndUpcoming = [...filterByArea(deferredAuctions)].sort((a, b) => {
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
  const advanceAuctionsAll = liveAndUpcoming.filter(a => a.listing_type === 'auction');

  // 날짜·가격 필터 적용 (얼리버드 한정)
  const advanceAuctions = useMemo(
    () => advanceAuctionsAll
      .filter(a => matchesDate(a, dateFilter))
      .filter(a => matchesPrice(a, priceRange)),
    [advanceAuctionsAll, dateFilter, priceRange]
  );

  // 날짜 칩 후보 추출 (필터 적용 전 풀에서)
  const availableEventDates = useMemo(
    () => Array.from(new Set(advanceAuctionsAll.map(a => a.event_date))),
    [advanceAuctionsAll]
  );

  const isAreaActive = !!selectedArea;
  const isDateActive = dateFilter !== "all";
  const isPriceActive = !isDefaultPriceRange(priceRange);
  const hasActiveFilter = isAreaActive || isDateActive || isPriceActive;
  const hasAdvanceFilter = isDateActive || isPriceActive;

  // 깃발 꽂기 링크용 날짜 (선택된 dateFilter에서 추출)
  const flagDateParam = useMemo(() => {
    if (dateFilter === "all") return "";
    const baseline = dayjs(getClubEventDate());
    if (dateFilter === "this_weekend") return baseline.day(6).format("YYYY-MM-DD");
    if (dateFilter === "next_weekend") return baseline.day(6).add(1, "week").format("YYYY-MM-DD");
    return dateFilter;
  }, [dateFilter]);

  const resetAdvanceFilters = () => {
    setDateFilter("all");
    setPriceRange([PRICE_MIN, PRICE_MAX]);
    onAreaChange?.(null);
  };

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

  // 퍼즐: 지역 필터 적용 ("서울 어디든"은 강남/홍대/이태원/건대 어느 것 선택해도 매칭)
  const filteredPuzzles = puzzles.filter((p) => matchesArea(p.area, selectedArea ?? null));

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
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide flex-1 min-w-0 touch-pan-x">
          <button
            onClick={() => setTab("puzzle")}
            className={`text-[13px] font-bold px-3 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${tab === "puzzle"
              ? "bg-amber-500 text-black"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
          >
            ⛳ 깃발 {filteredPuzzles.length > 0 && `(${filteredPuzzles.length})`}
          </button>

          <button
            onClick={() => setTab("advance")}
            className={`text-[13px] font-bold px-3 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${tab === "advance"
              ? "bg-amber-500 text-black"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
          >
            📅 얼리버드 경매 {advanceAuctionsAll.length > 0 && `(${advanceAuctionsAll.length})`}
          </button>

          {instantEnabled && (
            <button
              onClick={() => setTab("today")}
              className={`text-[13px] font-bold px-3 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${tab === "today"
                ? "bg-amber-500 text-black"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
            >
              🔥 오늘특가 {todayAuctions.length > 0 && `(${todayAuctions.length})`}
            </button>
          )}
        </div>

        {onShowGuide && (tab === "puzzle" || tab === "advance") && (
          <button
            onClick={onShowGuide}
            className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors flex-shrink-0 whitespace-nowrap"
          >
            <span className="text-[13px]">ⓘ</span>
            {tab === "puzzle" ? "깃발이란?" : "얼리버드란?"}
          </button>
        )}
      </div>

      {tabPromises && tabPromises[tab] && (
        <div className="relative rounded-2xl bg-gradient-to-r from-amber-500/30 via-orange-500/20 to-red-500/15 border border-amber-500/40 px-4 pt-5 pb-3">
          <span className="absolute -top-2.5 left-3 text-[10px] font-black bg-amber-500 text-black px-2 py-0.5 rounded-full">
            Tip
          </span>
          <p className="text-[14px] text-white font-bold leading-snug whitespace-pre-line break-keep">
            {tabPromises[tab].content}
          </p>
          {tabPromises[tab].note && (
            <p className="mt-2 text-right text-[10px] text-amber-300/70 font-medium whitespace-nowrap">
              {tabPromises[tab].note}
            </p>
          )}
        </div>
      )}

      {guideSlot}

      <div className="flex items-center gap-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1 pb-1 touch-pan-x flex-1 min-w-0">
            <button
              onClick={() => onAreaChange?.(null)}
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
                onClick={() => onAreaChange?.(area)}
                className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                  selectedArea === area
                    ? "bg-white text-black"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                {area}
              </button>
            ))}
            <button
              onClick={() => onAreaChange?.("다른지역")}
              className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                selectedArea === "다른지역"
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
            >
              다른지역
            </button>
          </div>
          {tab === "advance" && deferredAuctions.some(a => a.listing_type === "auction") && (
            <div className="flex items-center gap-1.5 flex-shrink-0 pb-1">
              {hasAdvanceFilter && (
                <button
                  onClick={resetAdvanceFilters}
                  className="text-[11px] font-bold text-neutral-400 hover:text-white transition-colors px-2"
                >
                  초기화
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setFilterSheetOpen(true)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    hasAdvanceFilter
                      ? "bg-white text-black"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
                {hasAdvanceFilter && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full" />
                )}
              </div>
            </div>
          )}
        </div>

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

      {/* 얼리버드 필터 Sheet */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl px-5 pb-10">
          <SheetHeader className="pt-2 pb-4">
            <SheetTitle className="text-white font-black text-lg text-left">필터</SheetTitle>
          </SheetHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-[12px] font-bold text-neutral-400 px-1">날짜</p>
              <DateFilterCalendar
                eventDates={availableEventDates}
                value={dateFilter}
                onChange={setDateFilter}
              />
            </div>
            <div className="space-y-2">
              <PriceRangeFilter value={priceRange} onChange={setPriceRange} />
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={resetAdvanceFilters}
                disabled={!hasActiveFilter}
                className={`text-[12px] font-bold transition-colors ${
                  hasActiveFilter
                    ? "text-neutral-400 hover:text-white"
                    : "text-transparent pointer-events-none"
                }`}
              >
                초기화
              </button>
            </div>
            {advanceAuctions.length === 0 && dateFilter !== "all" ? (
              <Link href={flagDateParam ? `/flags/new?date=${flagDateParam}` : "/flags/new"} onClick={() => setFilterSheetOpen(false)} className="block">
                <button className="w-full bg-amber-500 text-black rounded-2xl flex flex-col items-center justify-center gap-1 py-3 px-4">
                  <span className="text-[11px] font-medium opacity-70 text-center leading-tight">
                    이 날 경매가 없나요? 괜찮아요!
                  </span>
                  <span className="text-[14px] font-black text-center leading-tight">
                    깃발 꽂고 시크릿 오퍼 받기 ⛳
                  </span>
                </button>
              </Link>
            ) : (
              <button
                onClick={() => setFilterSheetOpen(false)}
                className="w-full h-16 bg-white text-black font-black text-[14px] rounded-2xl"
              >
                {advanceAuctions.length}건 보기
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {tab === "advance" && (
        <div className="space-y-3">

          {advanceAuctionsAll.length === 0 ? (
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
          ) : advanceAuctions.length === 0 ? (
            <div className="text-center pt-8 pb-16 space-y-4">
              <div className="space-y-2">
                <p className="text-[15px] font-bold text-neutral-300">선택한 조건에 맞는 경매가 없어요</p>
                <p className="text-[12px] text-neutral-500 leading-relaxed">
                  필터를 조정해보세요.
                </p>
              </div>
              <button
                onClick={resetAdvanceFilters}
                className="inline-block px-5 py-2 bg-white text-black text-[13px] font-black rounded-full"
              >
                필터 초기화
              </button>
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
        <>
          <MyPuzzleResultsBanner />
          <PuzzleList
            puzzles={filteredPuzzles}
            userRole={userRole}
            offerCounts={puzzleOfferCounts}
            selectedArea={selectedArea}
          />
        </>
      )}

    </div>
  );
}
