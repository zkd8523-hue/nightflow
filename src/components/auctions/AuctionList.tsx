"use client";

import { useState, useMemo, useRef, useDeferredValue } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import type { Auction, Puzzle } from "@/types/database";
import { AuctionCard } from "./AuctionCard";
import { PuzzleSocialProofBanner } from "./PuzzleSocialProofBanner";
import { PuzzleList } from "@/components/puzzles/PuzzleList";
import { isAuctionActive, getEffectiveEndTime, SHARE_MAX_EVENT_DAYS_AHEAD } from "@/lib/utils/auction";
import { getClubEventDate } from "@/lib/utils/date";
import { DateGroup } from "@/components/ui/DateGroup";
import { isInstantEnabled } from "@/lib/features";
import { MAIN_AREAS } from "@/lib/constants/areas";
import { matchesArea } from "@/lib/utils/area";
import { getDDayLabel } from "@/lib/utils/format";
import { SlidersHorizontal, ArrowLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DateFilterCalendar } from "./filters/DateFilterCalendar";
import { PriceRangeFilter } from "./filters/PriceRangeFilter";
import { ClubRequestCTA } from "./ClubRequestCTA";
import { FlagPlantCTA } from "./FlagPlantCTA";
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
  { value: "value", label: "~9만" },
  { value: "standard", label: "10~19만" },
  { value: "premium", label: "20만+" },
];
const SHARE_SEAT_CHIPS: { value: SeatFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "1", label: "1자리" },
  { value: "2", label: "2자리" },
  { value: "3+", label: "3자리+" },
];
function ShareFilterRow({ label, chips, value, onChange }: { label: string; chips: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div data-no-pull-refresh className="flex items-center gap-2 overflow-x-auto scrollbar-hide touch-pan-x touch-pan-y touch-pan-y">
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
interface AuctionListProps {
  activeAuctions: Auction[];
  puzzles?: Puzzle[];
  puzzleOfferCounts?: Record<string, number>;
  selectedArea?: string | null;
  onAreaChange?: (area: string | null) => void;
  userBidMap?: Map<string, number>;
  userInterestedSet?: Set<string>;
  userRole?: "user" | "md" | "admin";
  currentUserId?: string;
  initialTab?: "today" | "advance" | "puzzle" | "share";
  onTabChange?: (tab: "today" | "advance" | "puzzle" | "share") => void;
  onShowGuide?: () => void;
  tabPromises?: Partial<Record<"today" | "advance" | "puzzle" | "share", { content: React.ReactNode; note?: React.ReactNode }>>;
  guideSlot?: React.ReactNode;
  hideTabs?: boolean;
  hideAreaFilter?: boolean;
  /** 조각 빈 상태(빈 리스트일 때 CTA) 숨김 — 클럽 상세 페이지 등 임베드 시 사용 */
  hideShareEmptyState?: boolean;
  /** 탭 좌측에 뒤로가기 버튼 표시 (풀 모드 진입 시) */
  onBack?: () => void;
}

export function AuctionList({ activeAuctions: initialAuctions, puzzles = [], puzzleOfferCounts = {}, selectedArea, onAreaChange, userBidMap, userInterestedSet, userRole, currentUserId, initialTab, onTabChange, onShowGuide, tabPromises, guideSlot, hideTabs, hideAreaFilter, hideShareEmptyState, onBack }: AuctionListProps) {
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
  const [puzzleSortMode, setPuzzleSortMode] = useState<"none" | "popular" | "budget" | "recent">("none");
  const puzzlePopularSort = puzzleSortMode === "popular";

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
  const [shareSort, setShareSort] = useState<"deadline" | "recent" | "seats">("deadline");
  const [shareNbi, setShareNbi] = useState<NbiFilter>("all");
  const [shareSeat, setShareSeat] = useState<SeatFilter>("all");
  const [shareDateFilter, setShareDateFilter] = useState<DateFilter>("all");
  const [shareFilterOpen, setShareFilterOpen] = useState(false);
  const [myShareOnly, setMyShareOnly] = useState(false);

  const shareEventDates = useMemo(() => Array.from(new Set(shareAuctions.map(a => a.event_date))), [shareAuctions]);
  const filteredShareAuctions = useMemo(() => shareAuctions.filter(a => {
    if (myShareOnly && a.md_id !== currentUserId) return false;
    const price = a.price_per_seat ?? 0;
    if (shareNbi === "value" && price > 90000) return false;
    if (shareNbi === "standard" && (price < 100000 || price > 190000)) return false;
    if (shareNbi === "premium" && price < 200000) return false;
    const seatsLeft = (a.total_seats ?? 0) - (a.seats_claimed ?? 0) - (a.external_attendees ?? 0);
    if (shareSeat === "1" && seatsLeft !== 1) return false;
    if (shareSeat === "2" && seatsLeft !== 2) return false;
    if (shareSeat === "3+" && seatsLeft < 3) return false;
    if (!matchesDate(a, shareDateFilter)) return false;
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
  const filteredPuzzles = useMemo(() => {
    const filtered = puzzles.filter((p) => matchesArea(p.area, selectedArea ?? null));
    if (puzzleSortMode === "popular") return [...filtered].sort((a, b) => (puzzleOfferCounts[b.id] || 0) - (puzzleOfferCounts[a.id] || 0));
    if (puzzleSortMode === "budget") return [...filtered].sort((a, b) => (b.total_budget ?? b.budget_per_person * b.target_count) - (a.total_budget ?? a.budget_per_person * a.target_count));
    if (puzzleSortMode === "recent") return [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return filtered;
  }, [puzzles, selectedArea, puzzleSortMode, puzzleOfferCounts]);

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
    <div className="flex flex-col">
      {!hideTabs && (
      <div className="flex items-center gap-2 -mx-4 px-4 mb-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="뒤로가기"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-neutral-800 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
        )}
        <div data-no-pull-refresh className="overflow-x-auto scrollbar-hide flex-1 min-w-0 touch-pan-x touch-pan-y touch-pan-y">
          <div className="flex gap-2 w-max pr-4 items-end">
            <button
              onClick={() => setTab("puzzle")}
              className={`text-[13px] font-bold px-3 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${tab === "puzzle"
                ? "bg-amber-500 text-black"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
            >
              <span className="text-[18px] leading-none">🚩</span> 깃발
            </button>

            <button
              onClick={() => setTab("share")}
              className={`text-[13px] font-bold px-3 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${tab === "share"
                ? "bg-amber-500 text-black"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
            >
              <span className="text-[16px] leading-none">🧩</span> 조각
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
        </div>
        {/* "ⓘ 이용방법"은 Tip 박스 우하단으로 이동 — 시선 위계 통합 */}
      </div>
      )}

      {guideSlot}

      <div className="flex items-center gap-2 mb-2 h-9">
          {!hideAreaFilter && (
          <div
            data-no-pull-refresh
            className="overflow-x-auto scrollbar-hide touch-pan-x touch-pan-y flex-1 min-w-0 h-9 flex items-center"
            style={{
              maskImage: "linear-gradient(to right, black calc(100% - 24px), transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, black calc(100% - 24px), transparent 100%)",
            }}
          >
            <div className="flex gap-2 px-1 pr-6 w-max">
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
          )}
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
          {/* 정렬 select는 PuzzleList 내부 첫 헤더로 이동 (모바일 칩 row와 겹침 방지) */}
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
                    깃발 꽂고 시크릿오퍼 받기 ⛳
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

      {/* 조각 필터 Sheet */}
      <Sheet open={shareFilterOpen} onOpenChange={setShareFilterOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl px-5 pb-10">
          <SheetHeader className="pt-2 pb-4">
            <SheetTitle className="text-white font-black text-lg text-left">필터</SheetTitle>
          </SheetHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-[12px] font-bold text-neutral-400 px-1">날짜</p>
              <DateFilterCalendar
                eventDates={shareEventDates}
                value={shareDateFilter}
                onChange={setShareDateFilter}
                maxDate={dayjs().add(SHARE_MAX_EVENT_DAYS_AHEAD, "day").format("YYYY-MM-DD")}
                rangeMode
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={() => setShareDateFilter("all")}
                disabled={shareDateFilter === "all"}
                className={`text-[12px] font-bold transition-colors ${
                  shareDateFilter !== "all"
                    ? "text-neutral-400 hover:text-white"
                    : "text-transparent pointer-events-none"
                }`}
              >
                초기화
              </button>
            </div>
            <button
              onClick={() => setShareFilterOpen(false)}
              className="w-full h-16 bg-white text-black font-black text-[14px] rounded-2xl"
            >
              {filteredShareAuctions.length}건 보기
            </button>
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
        <div className="space-y-2">
          {/* 헤더 + 필터 버튼 */}
          {shareAuctions.length > 0 && (
            <div className="flex flex-col gap-1 px-1">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5 mt-[1px] flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <span className="text-[16px] font-black text-white tracking-tight">모집 중인 조각</span>
                {/* 마감임박순·필터 버튼은 첫 날짜 헤더 우측으로 이동 */}
              </div>
              {/* N비 필터 + 내 조각 */}
              <div className="flex items-center gap-1.5 pb-0.5">
                <div data-no-pull-refresh className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide touch-pan-x touch-pan-y flex-1 min-w-0">
                  {SHARE_NBI_CHIPS.map(({ value, label }) => (
                    <button key={value}
                      onClick={() => setShareNbi(v => v === value ? "all" : value as NbiFilter)}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${shareNbi === value ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {userRole && ["md", "admin"].includes(userRole) && (
                  <button onClick={() => setMyShareOnly(v => !v)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${myShareOnly ? "bg-green-500 text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}>
                    내 조각
                  </button>
                )}
              </div>
              {/* 정렬 */}
            </div>
          )}

          {/* 날짜별 그룹 */}
          {shareAuctions.length === 0 ? (
            hideShareEmptyState ? null : (
            <div className="flex flex-col items-center justify-center py-14 text-center space-y-5">
              <span className="text-[40px] leading-none opacity-90">🧩</span>
              {userRole && ["md", "admin"].includes(userRole) ? (
                <>
                  <div className="space-y-1.5">
                    <p className="text-white text-[16px] font-black leading-tight tracking-tight break-keep">
                      지금은 다른 조각이 없어요!
                    </p>
                    <p className="text-neutral-500 text-[12.5px] font-medium leading-relaxed break-keep">
                      경쟁 조각이 없어서 유저 시선 독차지
                    </p>
                  </div>
                  <Link
                    href="/md/auctions/new"
                    className="inline-flex items-center gap-1.5 h-11 px-6 bg-green-500 text-black font-black text-[13.5px] rounded-full hover:bg-green-400 transition-colors active:scale-[0.98] tracking-tight"
                  >
                    조각 등록하기
                  </Link>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <p className="text-white text-[16px] font-black leading-tight tracking-tight break-keep">
                      아직 등록된 조각이 없어요
                    </p>
                    <p className="text-neutral-500 text-[12.5px] font-medium leading-relaxed break-keep">
                      깃발을 꽂으면 MD가 직접 제안을 보내요
                    </p>
                  </div>
                  <Link
                    href="/flags/new"
                    className="inline-flex items-center gap-1.5 h-11 px-6 bg-amber-500 text-black font-black text-[13.5px] rounded-full hover:bg-amber-400 transition-colors active:scale-[0.98] tracking-tight"
                  >
                    🚩 깃발 꽂으러 가기
                  </Link>
                </>
              )}
            </div>
            )
          ) : filteredShareAuctions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <p className="text-neutral-400 text-sm font-medium">
                {userRole === "md" ? "아직 올라온 조각이 없어요" : "조건에 맞는 조각이 없어요"}
              </p>
              <button onClick={() => { setShareNbi("all"); setShareSeat("all"); setShareDateFilter("all"); }}
                className="text-[12px] font-bold text-neutral-500 hover:text-white transition-colors">필터 초기화</button>
              <div className="pt-2">
                {userRole === "md" ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-[12px] text-neutral-500 font-medium">
                      지금 선점하면 손님이 제일 먼저 봐요
                    </p>
                    <Link
                      href="/md/auctions/new"
                      className="inline-flex items-center gap-1.5 h-11 px-5 bg-amber-500 text-black font-black text-[13px] rounded-full hover:bg-amber-400 transition-colors active:scale-[0.98]"
                    >
                      🧩 내 조각 먼저 올리기
                    </Link>
                  </div>
                ) : (
                  <FlagPlantCTA variant="empty" isLoggedIn={!!currentUserId} />
                )}
              </div>
            </div>
          ) : (
            Object.entries(
              [...filteredShareAuctions]
                .sort((a, b) => {
                  if (shareSort === "recent") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                  if (shareSort === "seats") {
                    const seatsA = (a.total_seats ?? 0) - (a.seats_claimed ?? 0) - (a.external_attendees ?? 0);
                    const seatsB = (b.total_seats ?? 0) - (b.seats_claimed ?? 0) - (b.external_attendees ?? 0);
                    return seatsA - seatsB;
                  }
                  return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
                })
                .reduce((groups, auction) => {
                  const date = auction.event_date;
                  if (!groups[date]) groups[date] = [];
                  groups[date].push(auction);
                  return groups;
                }, {} as Record<string, Auction[]>)
            )
              .sort(([, aItems], [, bItems]) => {
                if (shareSort === "recent") {
                  const maxA = Math.max(...aItems.map(a => new Date(a.created_at).getTime()));
                  const maxB = Math.max(...bItems.map(b => new Date(b.created_at).getTime()));
                  return maxB - maxA;
                }
                return aItems[0].event_date.localeCompare(bItems[0].event_date);
              })
              .map(([date, items], idx) => {
                const d = new Date(date + "T00:00:00");
                const dateLabel = `${d.getMonth()+1}월 ${d.getDate()}일 (${["일","월","화","수","목","금","토"][d.getDay()]})`;
                const dday = getDDayLabel(date);
                return (
                  <div key={date}>
                    <div className="flex items-center gap-2.5 px-1 py-1 mb-3">
                      <div className="w-1 h-[14px] bg-amber-500 rounded-full mt-[1px] flex-shrink-0" />
                      <h3 className="text-[16px] font-black text-white tracking-tight whitespace-nowrap">{dateLabel}</h3>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full mt-[1px] whitespace-nowrap flex-shrink-0 ${dday === "오늘" ? "bg-amber-500/20 text-amber-400" : "bg-neutral-800 text-neutral-400"}`}>
                        {dday}
                      </span>
                      {idx === 0 && (
                        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                          {/* 마감임박순 — 추후 복귀 가능, 현재 숨김
                          <button
                            onClick={() => setShareSort(v => v === "seats" ? "deadline" : "seats")}
                            className={`text-[11px] font-bold px-3 py-1 rounded-full transition-colors whitespace-nowrap ${shareSort === "seats" ? "bg-amber-500 text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}>
                            마감임박순
                          </button>
                          */}
                          <button
                            onClick={() => setShareFilterOpen(true)}
                            aria-label="필터"
                            className={`relative inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors ${shareDateFilter !== "all" ? "bg-amber-500 text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}>
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            {shareDateFilter !== "all" && (
                              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-7">
                      {items.map(auction => (
                        <AuctionCard key={auction.id} auction={auction} userBidAmount={userBidMap?.get(auction.id)} currentUserId={currentUserId} />
                      ))}
                    </div>
                  </div>
                );
              })
          )}

          {/* 리스트 끝: 유저는 깃발 꽂기 유도, MD는 기존 클럽 요청 (클럽 상세에서는 floating CTA가 대체) */}
          {filteredShareAuctions.length > 0 && !hideShareEmptyState && (
            <div className="pt-2">
              {userRole === "md" ? (
                <ClubRequestCTA variant="list-end" defaultArea={selectedArea ?? null} />
              ) : (
                <FlagPlantCTA variant="list-end" isLoggedIn={!!currentUserId} />
              )}
            </div>
          )}

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
          popularSort={puzzlePopularSort}
          recentSort={puzzleSortMode === "recent"}
          budgetSort={puzzleSortMode === "budget"}
          sortMode={puzzleSortMode}
          onSortModeChange={setPuzzleSortMode}
        />
      )}

    </div>
  );
}
