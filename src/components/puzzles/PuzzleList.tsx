"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Plus, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { PuzzleCard } from "./PuzzleCard";
import { PuzzleJoinSheet } from "./PuzzleJoinSheet";
import { OfferSheet } from "./OfferSheet";
import { DateFilterChips } from "@/components/auctions/filters/DateFilterChips";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import dayjs from "dayjs";
import type { DateRange } from "react-day-picker";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics/events";
import type { Puzzle } from "@/types/database";
import {
  type NbiFilter,
  type SeatFilter,
  type DateFilter as PuzzleDateFilter,
  NBI_BANDS,
  matchesNbi,
  matchesSeat,
  matchesDate as matchesDatePuzzle,
} from "@/lib/utils/puzzleFilters";
import { getPuzzleGroupDeadline } from "@/lib/utils/format";

const NBI_CHIPS: { value: NbiFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "value", label: "가성비 ~9만" },
  { value: "standard", label: "스탠다드 10~15만" },
  { value: "premium", label: "프리미엄 15만+" },
];

const SEAT_CHIPS: { value: SeatFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "1", label: "1자리" },
  { value: "2", label: "2자리" },
  { value: "3+", label: "3자리+" },
];

function FilterRow({
  label,
  chips,
  value,
  onChange,
}: {
  label: string;
  chips: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide touch-pan-x">
      <span className="text-[11px] font-bold text-neutral-500 whitespace-nowrap flex-shrink-0">{label}</span>
      {chips.map((chip) => {
        const active = chip.value === value;
        return (
          <button
            key={chip.value}
            onClick={() => onChange(chip.value)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
              active
                ? "bg-white text-black"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

function getDDay(eventDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(eventDate);
  event.setHours(0, 0, 0, 0);
  const diff = Math.round((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

interface PuzzleListProps {
  puzzles: Puzzle[];
  userRole?: "user" | "md" | "admin";
  offerCounts?: Record<string, number>;
  selectedArea?: string | null;
  /** 외부(부모)에서 필터 시트를 컨트롤할 때 사용 */
  filterOpen?: boolean;
  onFilterOpenChange?: (open: boolean) => void;
  /** 활성 필터 여부 변경 시 부모에 전달 (지역 칩 옆 amber dot 등) */
  onActiveFilterChange?: (hasActive: boolean) => void;
  /** 필터 초기화 콜백을 부모가 호출할 수 있도록 ref로 노출 */
  resetRef?: React.MutableRefObject<(() => void) | null>;
  /** "파티원 모집만" 토글: 외부(부모)에서 컨트롤할 때 사용. 미지정 시 내부 상태 */
  partyOnly?: boolean;
  onPartyOnlyChange?: (v: boolean) => void;
}

export function PuzzleList({
  puzzles,
  userRole,
  offerCounts = {},
  selectedArea,
  filterOpen,
  onFilterOpenChange,
  onActiveFilterChange,
  resetRef,
  partyOnly: partyOnlyProp,
  onPartyOnlyChange,
}: PuzzleListProps) {
  const [joinTarget, setJoinTarget] = useState<Puzzle | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<Puzzle | null>(null);
  const [myPuzzleIds, setMyPuzzleIds] = useState<Set<string>>(new Set());
  const [myOfferedPuzzleIds, setMyOfferedPuzzleIds] = useState<Set<string>>(new Set());
  // MD 전용 정렬 순환: 등록순 → 높은순 → 낮은순 → 등록순 ...
  const [sortMode, setSortMode] = useState<"registered" | "desc" | "asc">("registered");
  // 모드 뷰 바이너리 토글:
  //   OFF(회색, 기본): 퍼즐+깃발 혼합 / ON(활성, 흰색): 파티원 모집중 퍼즐만
  // 부모 컨트롤 우선, 미지정 시 내부 상태 사용
  const [internalPartyOnly, setInternalPartyOnly] = useState(false);
  const partyOnly = partyOnlyProp ?? internalPartyOnly;
  const setPartyOnly = onPartyOnlyChange ?? setInternalPartyOnly;
  // Phase 1: 3종 필터 (지역은 상위 AuctionList에서 처리, 중복 제거)
  const [nbiFilter, setNbiFilter] = useState<NbiFilter>("all");
  const [seatFilter, setSeatFilter] = useState<SeatFilter>("all");
  const [dateFilter, setDateFilter] = useState<PuzzleDateFilter>("all");
  // 필터 시트 open 상태: 부모가 controlled하면 부모 우선, 아니면 자체 관리
  const [internalFilterOpen, setInternalFilterOpen] = useState(false);
  const filterSheetOpen = filterOpen ?? internalFilterOpen;
  const setFilterSheetOpen = onFilterOpenChange ?? setInternalFilterOpen;
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const isMd = userRole === "md" || userRole === "admin";

  // 마감 시간 배지가 분 단위로 갱신되도록 30초마다 강제 rerender
  const [, setDeadlineTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDeadlineTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: members }, { data: offers }] = await Promise.all([
        supabase.from("puzzle_members").select("puzzle_id").eq("user_id", user.id),
        supabase.from("puzzle_offers").select("puzzle_id").eq("md_id", user.id).in("status", ["pending", "accepted"]),
      ]);

      if (members) setMyPuzzleIds(new Set(members.map(d => d.puzzle_id)));
      if (offers) setMyOfferedPuzzleIds(new Set(offers.map(d => d.puzzle_id)));
    })();
  }, []);

  // Phase 1: 3종 필터 (엔비/자리/날짜) + 파티원 모집만 토글. 지역은 부모(AuctionList).
  // partyOnly=false(기본): 혼합. partyOnly=true: 파티원 모집중 퍼즐만.
  const filteredPuzzles = useMemo(() => {
    return puzzles.filter((p) => {
      if (partyOnly && !p.is_recruiting_party) return false;
      return (
        matchesNbi(p, nbiFilter) &&
        matchesSeat(p, seatFilter) &&
        matchesDatePuzzle(p, dateFilter)
      );
    });
  }, [puzzles, nbiFilter, seatFilter, dateFilter, partyOnly]);

  const eventDates = useMemo(() => {
    return Array.from(new Set(puzzles.map((p) => p.event_date)));
  }, [puzzles]);

  const hasActiveFilter =
    nbiFilter !== "all" || seatFilter !== "all" || dateFilter !== "all";

  // 부모에 활성 필터 / reset 콜백 노출
  useEffect(() => {
    onActiveFilterChange?.(hasActiveFilter);
  }, [hasActiveFilter, onActiveFilterChange]);

  useEffect(() => {
    if (resetRef) {
      resetRef.current = () => {
        setNbiFilter("all");
        setSeatFilter("all");
        setDateFilter("all");
      };
    }
  }, [resetRef]);

  const getBudget = (p: Puzzle) =>
    p.total_budget ?? p.budget_per_person * p.target_count;

  const togglePartyOnly = () => setPartyOnly(!partyOnly);

  const cycleSortMode = () => {
    setSortMode((cur) => (cur === "registered" ? "desc" : cur === "desc" ? "asc" : "registered"));
  };

  const sortLabel =
    sortMode === "registered" ? "등록순" : sortMode === "desc" ? "높은순 ↑" : "낮은순 ↓";

  // "파티원 모집만" + 정렬 토글: 첫 그룹 헤더 우측에 같이 표시
  const toggleButton = (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <button
        onClick={togglePartyOnly}
        className={`h-7 px-3 inline-flex items-center rounded-full text-[12px] leading-none font-bold transition-colors ${
          partyOnly
            ? "bg-white text-black"
            : "bg-neutral-800 text-neutral-400"
        }`}
        aria-pressed={partyOnly}
      >
        파티원 모집만
      </button>
      {/* 정렬은 MD/Admin 전용 */}
      {isMd && (
        <button
          onClick={cycleSortMode}
          className={`h-7 px-3 inline-flex items-center rounded-full text-[12px] leading-none font-bold transition-colors ${
            sortMode === "registered"
              ? "bg-neutral-800 text-neutral-400"
              : "bg-white text-black"
          }`}
        >
          {sortLabel}
        </button>
      )}
    </div>
  );

  return (
    <div className="relative">
      {/* 필터 아이콘 버튼: 부모(AuctionList)가 컨트롤하지 않을 때만 자체 노출 */}
      {puzzles.length > 0 && onFilterOpenChange === undefined && (
        <div className="flex items-center justify-end gap-1.5 mb-3">
          {hasActiveFilter && (
            <button
              onClick={() => {
                setNbiFilter("all");
                setSeatFilter("all");
                setDateFilter("all");
              }}
              className="text-[11px] font-bold text-neutral-400 hover:text-white transition-colors px-2"
            >
              초기화
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setFilterSheetOpen(true)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                hasActiveFilter
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
              aria-label="필터"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            {hasActiveFilter && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full" />
            )}
          </div>
        </div>
      )}

      {/* 필터 Sheet */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl px-5 pb-10">
          <SheetHeader className="pt-2 pb-4">
            <SheetTitle className="text-white font-black text-lg text-left">필터</SheetTitle>
          </SheetHeader>
          <div className="space-y-5">
            <FilterRow
              label="엔비"
              chips={NBI_CHIPS}
              value={nbiFilter}
              onChange={(v) => setNbiFilter(v as NbiFilter)}
            />
            <FilterRow
              label="자리"
              chips={SEAT_CHIPS}
              value={seatFilter}
              onChange={(v) => setSeatFilter(v as SeatFilter)}
            />
            {eventDates.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-neutral-500 whitespace-nowrap flex-shrink-0">날짜</span>
                <DateFilterChips
                  eventDates={eventDates}
                  value={dateFilter}
                  onChange={(v) => setDateFilter(v)}
                />
              </div>
            )}
            {nbiFilter === "value" && (
              <p className="text-[11px] text-amber-400/80 px-1">
                💡 가성비 ({NBI_BANDS.value.label}) 퍼즐엔 방장수고비를 받지 않아요.
              </p>
            )}
            <div className="flex justify-end pt-1">
              <button
                onClick={() => {
                  setNbiFilter("all");
                  setSeatFilter("all");
                  setDateFilter("all");
                }}
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
            <button
              onClick={() => setFilterSheetOpen(false)}
              className="w-full h-16 bg-white text-black font-black text-[14px] rounded-2xl"
            >
              {filteredPuzzles.length}건 보기
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {filteredPuzzles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <div className="absolute top-0 right-0">{toggleButton}</div>
          <div className="space-y-2 text-center">
            {hasActiveFilter ? (
              <>
                <p className="text-[15px] font-bold text-neutral-300">조건에 맞는 퍼즐이 없어요</p>
                <p className="text-[12px] text-neutral-500 leading-relaxed">필터를 조정해보세요</p>
                <button
                  onClick={() => {
                    setNbiFilter("all");
                    setSeatFilter("all");
                    setDateFilter("all");
                  }}
                  className="inline-flex items-center gap-1.5 mt-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full px-5 py-2 text-[12px] font-bold transition-colors"
                >
                  필터 초기화
                </button>
              </>
            ) : isMd ? (
              <>
                <p className="text-[15px] font-bold text-neutral-300">아직 올라와 있는 퍼즐이 없어요</p>
                <p className="text-[12px] text-neutral-500 leading-relaxed">
                  퍼즐이 올라오면 알림으로 알려드릴게요
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-black text-white">
                  {selectedArea && selectedArea !== "다른지역" ? `${selectedArea} ` : ""}MD들이 24시간 기다리고 있어요
                </p>
                <p className="text-[12px] text-neutral-400 leading-relaxed">
                  어떤 시크릿 오퍼가 쏟아질지 궁금하죠?
                </p>
                <Link
                  href={userRole ? "/flags/new" : "/login?redirect=/flags/new"}
                  onClick={() => trackEvent("puzzle_cta_click", { source: "empty_state" })}
                  className="inline-flex items-center gap-1.5 mt-3 bg-white hover:bg-neutral-200 text-black rounded-full px-5 py-2.5 text-[13px] font-black transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  파티원 모집하기
                </Link>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-12 pb-24">
          {/* 🆕 방금 올라온 퍼즐/깃발 — 상단 별도 섹션 */}
          {(() => {
            // 베타 기간 한정 12h (정상 등록량 도달 시 6h로 환원)
            const RECENT_THRESHOLD_MS = 12 * 60 * 60 * 1000;
            const now = Date.now();
            // MD: 오퍼할 수 있는 깃발 상태(직접 등록 깃발 + 인원 충족된 퍼즐)만
            // 유저/비로그인: 모든 최근 퍼즐 (퍼즐/깃발 둘 다)
            const recentPuzzles = filteredPuzzles
              .filter(p => now - new Date(p.created_at).getTime() < RECENT_THRESHOLD_MS)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const recentTitle = "방금 꽂힌 깃발";
            const rest = filteredPuzzles;

            const recentDeadline = getPuzzleGroupDeadline(recentPuzzles);

            return (
              <>
                {recentPuzzles.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5 px-1 py-1">
                      <div className="flex items-center gap-2.5">
                        <span className="relative flex h-2.5 w-2.5 mt-[1px] flex-shrink-0">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-60 animate-ping" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                        </span>
                        <button
                          type="button"
                          onClick={() => setRecentCollapsed((v) => !v)}
                          className="flex items-center gap-1.5 text-[16px] font-black text-white tracking-tight hover:text-neutral-300 transition-colors whitespace-nowrap"
                          aria-label={recentCollapsed ? "펼치기" : "접기"}
                        >
                          {recentTitle}
                          {recentCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>
                        <div className="flex-1 flex justify-end">{toggleButton}</div>
                      </div>
                      {recentDeadline && (
                        <p
                          suppressHydrationWarning
                          className="text-[12px] font-semibold text-neutral-400 pl-4 leading-none"
                        >
                          {recentDeadline}
                        </p>
                      )}
                    </div>
                    {!recentCollapsed && (
                      <div className="space-y-4">
                        {recentPuzzles.map((puzzle) => (
                          <Link key={puzzle.id} href={`/flags/${puzzle.id}`} className="block" onClick={(e) => { e.stopPropagation(); trackEvent('puzzle_card_click', { puzzle_id: puzzle.id, area: puzzle.area, is_recruiting: puzzle.is_recruiting_party, source: 'recent' }); }}>
                            <PuzzleCard
                              puzzle={puzzle}
                              userRole={userRole}
                              offerCount={offerCounts[puzzle.id] || 0}
                              isMember={myPuzzleIds.has(puzzle.id)}
                              hasOffered={myOfferedPuzzleIds.has(puzzle.id)}
                              onJoin={(p) => setJoinTarget(p)}
                              onUnlock={(p) => setUnlockTarget(p)}
                            />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {Object.entries(
                  rest.reduce((groups, puzzle) => {
                    const date = puzzle.event_date;
                    if (!groups[date]) groups[date] = [];
                    groups[date].push(puzzle);
                    return groups;
                  }, {} as Record<string, Puzzle[]>)
                )
            .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
            .map(([date, rawItems], groupIdx) => {
              const items = isMd && sortMode !== "registered"
                ? [...rawItems].sort((a, b) =>
                    sortMode === "desc"
                      ? getBudget(b) - getBudget(a)
                      : getBudget(a) - getBudget(b)
                  )
                : rawItems;
              const d = new Date(date + "T00:00:00");
              const m = d.getMonth() + 1;
              const day = d.getDate();
              const days = ["일", "월", "화", "수", "목", "금", "토"];
              const dateLabel = `${m}월 ${day}일 (${days[d.getDay()]})`;

              const dday = getDDay(date);
              const deadline = getPuzzleGroupDeadline(items);

              return (
                <div key={date} className="space-y-4">
                  <div className="flex flex-col gap-1.5 px-1 py-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-1 h-[14px] bg-amber-500 rounded-full mt-[1px] flex-shrink-0" />
                      <h3 className="text-[16px] font-black text-white tracking-tight whitespace-nowrap">{dateLabel}</h3>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full mt-[1px] whitespace-nowrap flex-shrink-0 ${
                          dday === "오늘"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-neutral-800 text-neutral-400"
                        }`}
                      >
                        {dday}
                      </span>
                      {groupIdx === 0 && recentPuzzles.length === 0 && <div className="flex-1 flex justify-end">{toggleButton}</div>}
                    </div>
                    {deadline && (
                      <p
                        suppressHydrationWarning
                        className="text-[12px] font-semibold text-neutral-400 pl-3 leading-none"
                      >
                        {deadline}
                      </p>
                    )}
                  </div>
                  <div className="space-y-4">
                    {items.map((puzzle) => (
                      <Link key={puzzle.id} href={`/flags/${puzzle.id}`} className="block" onClick={(e) => { e.stopPropagation(); trackEvent('puzzle_card_click', { puzzle_id: puzzle.id, area: puzzle.area, is_recruiting: puzzle.is_recruiting_party }); }}>
                        <PuzzleCard
                          puzzle={puzzle}
                          userRole={userRole}
                          offerCount={offerCounts[puzzle.id] || 0}
                          isMember={myPuzzleIds.has(puzzle.id)}
                          hasOffered={myOfferedPuzzleIds.has(puzzle.id)}
                          onJoin={(p) => {
                            setJoinTarget(p);
                          }}
                          onUnlock={(p) => {
                            setUnlockTarget(p);
                          }}
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
              </>
            );
          })()}
        </div>
      )}

      {/* Floating CTA 버튼 (MD 제외) — 비로그인은 베네핏 호명, 로그인은 행동 호명 */}
      {userRole !== "md" && (
        <Link
          href={userRole ? "/flags/new" : "/login?redirect=/flags/new"}
          onClick={() => trackEvent("puzzle_cta_click", { source: "list_float" })}
          className="fixed bottom-24 right-4 flex items-center gap-2 bg-white hover:bg-neutral-200 text-black rounded-full pl-4 pr-3 py-3 shadow-lg z-40 transition-colors border-2 border-black"
        >
          <span className="text-black text-sm font-semibold whitespace-nowrap">
            나도 MD 줄세우기
          </span>
          <Plus className="w-5 h-5 text-black" />
        </Link>
      )}

      {/* 참여 Sheet */}
      {joinTarget && (
        <PuzzleJoinSheet
          puzzle={joinTarget}
          open={!!joinTarget}
          onClose={() => setJoinTarget(null)}
        />
      )}

      {/* MD 제안 Sheet */}
      {unlockTarget && (
        <OfferSheet
          puzzle={unlockTarget}
          open={!!unlockTarget}
          onClose={() => setUnlockTarget(null)}
        />
      )}
    </div>
  );
}
