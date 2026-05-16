"use client";

import { useState, useMemo, useRef, useDeferredValue } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import type { Auction, Puzzle } from "@/types/database";
import { AuctionCard } from "./AuctionCard";
import { PuzzleList } from "@/components/puzzles/PuzzleList";
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
import { DateFilterChips } from "./filters/DateFilterChips";
import { type NbiFilter, type SeatFilter, NBI_BANDS } from "@/lib/utils/puzzleFilters";
import {
  PRICE_MIN,
  PRICE_MAX,
  matchesDate,
  matchesPrice,
  isDefaultPriceRange,
  type DateFilter,
} from "@/lib/utils/auctionFilters";


const SHARE_NBI_CHIPS: { value: NbiFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "value", label: "가성비 ~9만" },
  { value: "standard", label: "스탠다드 10~15만" },
  { value: "premium", label: "프리미엄 15만+" },
];
const SHARE_SEAT_CHIPS: { value: SeatFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "1", label: "1자리" },
  { value: "2", label: "2자리" },
  { value: "3+", label: "3자리+" },
];
function ShareFilterRow({ label, chips, value, onChange }: { label: string; chips: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide touch-pan-x">
      <span className="text-[11px] font-bold text-neutral-500 whitespace-nowrap flex-shrink-0">{label}</span>
      {chips.map((chip) => {
        const active = chip.value === value;
        return (
          <button key={chip.value} onClick={() => onChange(chip.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${active ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}>
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
function getDDayShare(eventDate: string): string {
  const today = new Date(); today.setHours(0,0,0,0);
  const event = new Date(eventDate); event.setHours(0,0,0,0);
  const diff = Math.round((event.getTime() - today.getTime()) / (1000*60*60*24));
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

interface AuctionListProps {
  activeAuctions: Auction[];
  puzzles?: Puzzle[];
  puzzleOfferCounts?: Record<string, number>;
  selectedArea?: string | null;
  onAreaChange?: (area: string | null) => void;
  userBidMap?: Map<string, number>;
  userInterestedSet?: Set<string>;
  userRole?: "user" | "md" | "admin";
  initialTab?: "today" | "advance" | "puzzle" | "share";
  onTabChange?: (tab: "today" | "advance" | "puzzle" | "share") => void;
  onShowGuide?: () => void;
  tabPromises?: Partial<Record<"today" | "advance" | "puzzle" | "share", { content: React.ReactNode; note?: React.ReactNode }>>;
  guideSlot?: React.ReactNode;
}

export function AuctionList({ activeAuctions: initialAuctions, puzzles = [], puzzleOfferCounts = {}, selectedArea, onAreaChange, userBidMap, userInterestedSet, userRole, initialTab, onTabChange, onShowGuide, tabPromises, guideSlot }: AuctionListProps) {
  // Realtime 입찰 burst 시 필터 깜빡임 방지: deferred render
  const deferredAuctions = useDeferredValue(initialAuctions);

  // 얼리버드 추가 필터 (날짜·가격)
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // 퍼즐 탭 필터 (state lift up from PuzzleList — 아이콘을 지역 칩 옆에 배치하기 위함)
  const [puzzleFilterOpen, setPuzzleFilterOpen] = useState(false);
  const [puzzleHasActiveFilter, setPuzzleHasActiveFilter] = useState(false);
  const puzzleResetRef = useRef<(() => void) | null>(null);
  // "파티원 모집만" 토글: 지역 칩 옆 필터 행에 두기 위해 부모에서 관리
  const [puzzlePartyOnly, setPuzzlePartyOnly] = useState(false);

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
  // 조각: listing_type === 'share'
  const shareAuctions = liveAndUpcoming.filter(a => a.listing_type === 'share');
  const [shareSort, setShareSort] = useState<"deadline" | "recent">("deadline");
  const [shareNbi, setShareNbi] = useState<NbiFilter>("all");
  const [shareSeat, setShareSeat] = useState<SeatFilter>("all");
  const [shareDateFilter, setShareDateFilter] = useState<string>("all");
  const [shareFilterOpen, setShareFilterOpen] = useState(false);

  const shareEventDates = useMemo(() => Array.from(new Set(shareAuctions.map(a => a.event_date))), [shareAuctions]);
  const filteredShareAuctions = useMemo(() => shareAuctions.filter(a => {
    const price = a.price_per_seat ?? 0;
    if (shareNbi === "value" && price > NBI_BANDS.value.max) return false;
    if (shareNbi === "standard" && (price < NBI_BANDS.standard.min || price > NBI_BANDS.standard.max)) return false;
    if (shareNbi === "premium" && price < NBI_BANDS.premium.min) return false;
    const seatsLeft = (a.total_seats ?? 0) - (a.seats_claimed ?? 0) - (a.external_attendees ?? 0);
    if (shareSeat === "1" && seatsLeft !== 1) return false;
    if (shareSeat === "2" && seatsLeft !== 2) return false;
    if (shareSeat === "3+" && seatsLeft < 3) return false;
    if (shareDateFilter !== "all" && a.event_date !== shareDateFilter) return false;
    return true;
  }), [shareAuctions, shareNbi, shareSeat, shareDateFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [tab, setTabRaw] = useState<"today" | "advance" | "puzzle" | "share">(() => {
    if (initialTab && (initialTab !== "today" || instantEnabled)) return initialTab;
    if (instantEnabled && todayAuctions.length > 0) return "today";
    if (advanceAuctions.length > 0) return "advance";
    return "puzzle";
  });

  const setTab = (t: "today" | "advance" | "puzzle" | "share") => {
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
        <div className="overflow-x-auto pb-2 scrollbar-hide flex-1 min-w-0 touch-pan-x">
          <div className="flex gap-2 w-max pr-4">
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
              onClick={() => setTab("share")}
              className={`text-[13px] font-bold px-3 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${tab === "share"
                ? "bg-amber-500 text-black"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
            >
              🧩 조각 {shareAuctions.length > 0 && `(${shareAuctions.length})`}
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

            {onShowGuide && (tab === "advance" || tab === "puzzle" || tab === "share") && (
              <button
                onClick={onShowGuide}
                className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors flex-shrink-0 whitespace-nowrap px-1"
              >
                <span className="text-[13px]">ⓘ</span>
                {tab === "puzzle" ? "깃발 이용안내" : tab === "share" ? "조각 이용안내" : "얼리버드란?"}
              </button>
            )}
          </div>
        </div>
      </div>

      {tabPromises && tabPromises[tab] && (
        // Android WebView 페인트 무효화 대응:
        // - key={tab}로 탭 전환 시 wrapper 재마운트 → 페인트 강제 갱신
        // - transform: translateZ(0)로 별도 컴포지트 레이어 → 초기 페인트 안정화
        // - inline rgba로 Tailwind v4 opacity-modifier 우회
        <div
          key={tab}
          className="relative rounded-2xl px-4 pt-5 pb-3"
          style={{
            background:
              "linear-gradient(to right, rgba(245,158,11,0.30), rgba(249,115,22,0.20), rgba(239,68,68,0.15))",
            border: "1px solid rgba(245,158,11,0.40)",
            transform: "translateZ(0)",
            willChange: "transform",
          }}
        >
          <span className="absolute -top-2.5 left-3 text-[10px] font-black bg-amber-500 text-black px-2 py-0.5 rounded-full">
            Tip
          </span>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <p className="text-[14px] text-white font-bold leading-snug whitespace-pre-line break-keep">
              {tabPromises[tab].content}
            </p>
            {tabPromises[tab].note && (
              <p className="text-[10px] text-amber-300/70 font-medium sm:whitespace-nowrap sm:flex-shrink-0">
                {tabPromises[tab].note}
              </p>
            )}
          </div>
        </div>
      )}

      {guideSlot}

      <div className="flex items-center gap-2">
          <div className="overflow-x-auto scrollbar-hide pb-1 touch-pan-x flex-1 min-w-0">
            <div className="flex gap-2 px-1 pr-3 w-max">
              <button
                onClick={() => onAreaChange?.(null)}
                className={`text-[12px] font-bold px-2.5 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
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
                  className={`text-[12px] font-bold px-2.5 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
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
                className={`text-[12px] font-bold px-2.5 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                  selectedArea === "다른지역"
                    ? "bg-white text-black"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                다른지역
              </button>
            </div>
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
          {tab === "puzzle" && filteredPuzzles.length > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0 pb-1">
              {puzzleHasActiveFilter && (
                <button
                  onClick={() => puzzleResetRef.current?.()}
                  className="text-[11px] font-bold text-neutral-400 hover:text-white transition-colors px-2"
                >
                  초기화
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setPuzzleFilterOpen(true)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    puzzleHasActiveFilter
                      ? "bg-white text-black"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                  }`}
                  aria-label="필터"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
                {puzzleHasActiveFilter && (
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
        <SheetContent side="bottom" showCloseButton={false} className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl px-5 pb-10">
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

      {tab === "share" && (
        <div className="space-y-3">
          {/* 헤더 + 필터 버튼 */}
          {shareAuctions.length > 0 && (
            <div className="flex flex-col gap-1.5 px-1 py-1">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5 mt-[1px] flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <span className="text-[16px] font-black text-white tracking-tight">모집 중인 조각</span>
                <div className="flex-1 flex justify-end gap-1.5">
                  {[{ key: "deadline", label: "마감임박순" }, { key: "recent", label: "등록순" }].map(({ key, label }) => (
                    <button key={key} onClick={() => setShareSort(key as "deadline" | "recent")}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors ${shareSort === key ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                  <button onClick={() => setShareFilterOpen(true)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${(shareNbi !== "all" || shareSeat !== "all" || shareDateFilter !== "all") ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}>
                    <SlidersHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 날짜별 그룹 */}
          {shareAuctions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
              <p className="text-2xl">🧩</p>
              <p className="text-neutral-400 text-sm font-medium">등록된 조각이 없어요</p>
            </div>
          ) : filteredShareAuctions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
              <p className="text-neutral-400 text-sm font-medium">조건에 맞는 조각이 없어요</p>
              <button onClick={() => { setShareNbi("all"); setShareSeat("all"); setShareDateFilter("all"); }}
                className="text-[12px] font-bold text-neutral-500 hover:text-white transition-colors">필터 초기화</button>
            </div>
          ) : (
            Object.entries(
              [...filteredShareAuctions]
                .sort((a, b) => shareSort === "recent"
                  ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  : new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
                )
                .reduce((groups, auction) => {
                  const date = auction.event_date;
                  if (!groups[date]) groups[date] = [];
                  groups[date].push(auction);
                  return groups;
                }, {} as Record<string, Auction[]>)
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, items]) => {
                const d = new Date(date + "T00:00:00");
                const dateLabel = `${d.getMonth()+1}월 ${d.getDate()}일 (${["일","월","화","수","목","금","토"][d.getDay()]})`;
                const dday = getDDayShare(date);
                return (
                  <div key={date} className="space-y-3">
                    <div className="flex flex-col gap-1.5 px-1 py-1">
                      <div className="flex items-center gap-2.5">
                        <div className="w-1 h-[14px] bg-amber-500 rounded-full mt-[1px] flex-shrink-0" />
                        <h3 className="text-[16px] font-black text-white tracking-tight whitespace-nowrap">{dateLabel}</h3>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full mt-[1px] whitespace-nowrap flex-shrink-0 ${dday === "오늘" ? "bg-amber-500/20 text-amber-400" : "bg-neutral-800 text-neutral-400"}`}>
                          {dday}
                        </span>
                      </div>
                    </div>
                    {items.map(auction => (
                      <AuctionCard key={auction.id} auction={auction} userBidAmount={userBidMap?.get(auction.id)} />
                    ))}
                  </div>
                );
              })
          )}

          {/* 필터 Sheet */}
          <Sheet open={shareFilterOpen} onOpenChange={setShareFilterOpen}>
            <SheetContent side="bottom" showCloseButton={false} className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl px-5 pb-10">
              <SheetHeader className="pt-2 pb-4">
                <SheetTitle className="text-white font-black text-lg text-left">필터</SheetTitle>
              </SheetHeader>
              <div className="space-y-5">
                <ShareFilterRow label="엔비" chips={SHARE_NBI_CHIPS} value={shareNbi} onChange={(v) => setShareNbi(v as NbiFilter)} />
                <ShareFilterRow label="자리" chips={SHARE_SEAT_CHIPS} value={shareSeat} onChange={(v) => setShareSeat(v as SeatFilter)} />
                {shareEventDates.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-neutral-500 whitespace-nowrap flex-shrink-0">날짜</span>
                    <DateFilterChips eventDates={shareEventDates} value={shareDateFilter} onChange={setShareDateFilter} />
                  </div>
                )}
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => { setShareNbi("all"); setShareSeat("all"); setShareDateFilter("all"); }}
                    disabled={shareNbi === "all" && shareSeat === "all" && shareDateFilter === "all"}
                    className="text-[12px] font-bold text-neutral-400 hover:text-white transition-colors disabled:text-transparent disabled:pointer-events-none"
                  >초기화</button>
                </div>
                <button onClick={() => setShareFilterOpen(false)}
                  className="w-full h-16 bg-white text-black font-black text-[14px] rounded-2xl">
                  {filteredShareAuctions.length}건 보기
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      {tab === "puzzle" && (
        <PuzzleList
          puzzles={filteredPuzzles}
          userRole={userRole}
          offerCounts={puzzleOfferCounts}
          selectedArea={selectedArea}
          filterOpen={puzzleFilterOpen}
          onFilterOpenChange={setPuzzleFilterOpen}
          onActiveFilterChange={setPuzzleHasActiveFilter}
          resetRef={puzzleResetRef}
          partyOnly={puzzlePartyOnly}
          onPartyOnlyChange={setPuzzlePartyOnly}
        />
      )}

    </div>
  );
}
