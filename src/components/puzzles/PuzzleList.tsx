"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Plus, SlidersHorizontal, ChevronDown, ChevronUp, BadgeCheck } from "lucide-react";
import { PuzzleCard } from "./PuzzleCard";
import { ClubDirectCard, ClubDirectHeader, groupPuzzlesByClub } from "./ClubDirectCard";
import { PuzzleJoinSheet } from "./PuzzleJoinSheet";
import { OfferSheet } from "./OfferSheet";
import { DateFilterCalendar } from "@/components/auctions/filters/DateFilterCalendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import dayjs from "dayjs";
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
import { getPuzzleGroupDeadline, getDDayLabel } from "@/lib/utils/format";
import { usePreferredClubMeta } from "@/hooks/usePreferredClubMeta";

const NBI_CHIPS: { value: NbiFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "value", label: "~9만" },
  { value: "standard", label: "10~15만" },
  { value: "premium", label: "15만+" },
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
    <div data-no-pull-refresh className="flex items-center gap-2 overflow-x-auto scrollbar-hide touch-pan-x touch-pan-y">
      <span className="text-[11px] font-bold text-muted-foreground whitespace-nowrap flex-shrink-0">{label}</span>
      {chips.map((chip) => {
        const active = chip.value === value;
        return (
          <button
            key={chip.value}
            onClick={() => onChange(chip.value)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
              active
                ? "bg-inverse text-inverse-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
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
  popularSort?: boolean;
  recentSort?: boolean;
  budgetSort?: boolean;
  sortMode?: "none" | "popular" | "budget" | "recent";
  onSortModeChange?: (mode: "none" | "popular" | "budget" | "recent") => void;
  /** 조각(파티원 모집) 탭에서 재사용 — "깃발" 문구/빈상태/CTA를 조각으로 전환 */
  shareMode?: boolean;
  /** 클럽 상세 등 이미 예약/깃발 CTA가 있는 화면에서 조각 빈상태 CTA 중복 노출 방지 */
  hideEmptyState?: boolean;
  /**
   * shareMode에서 클럽 다이렉트(host_is_md) 섹션 취급.
   * "hidden"=섹션 제거(파티 탭 — 클럽 다이렉트는 별도 탭으로 분리됨)
   * "only"=클럽 다이렉트만 렌더(클럽 다이렉트 전용 탭)
   * 미지정=기존 혼합 동작(다른 호출부 호환용)
   */
  clubDirectMode?: "hidden" | "only";
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
  popularSort = false,
  recentSort = false,
  budgetSort = false,
  sortMode: externalSortMode = "none",
  onSortModeChange,
  shareMode = false,
  hideEmptyState = false,
  clubDirectMode,
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
  // MD 전용: 이미 오퍼 넣은 깃발 숨기기 — 더보기 화면에서 스캔할 때 새 깃발만 빠르게 훑기 위함
  const [hideOffered, setHideOffered] = useState(false);

  // 리스트 끝에서 floating CTA 숨기기 (인라인 CTA와 시각적 중복 방지)
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const [listEndVisible, setListEndVisible] = useState(false);

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

  // 제안받고 싶은 클럽(Migration 504) 칩/배지 메타 — HomePuzzleCarousel과 공용 훅
  const { preferredClubNames, myClubIds } = usePreferredClubMeta(puzzles, userRole);

  // Phase 1: 3종 필터 (엔비/자리/날짜) + 파티원 모집만 토글. 지역은 부모(AuctionList).
  // partyOnly=false(기본): 혼합. partyOnly=true: 파티원 모집중 퍼즐만.
  const filteredPuzzles = useMemo(() => {
    const base = puzzles.filter((p) => {
      if (partyOnly && !p.is_recruiting_party) return false;
      if (hideOffered && myOfferedPuzzleIds.has(p.id)) return false;
      return (
        matchesNbi(p, nbiFilter) &&
        matchesSeat(p, seatFilter) &&
        matchesDatePuzzle(p, dateFilter)
      );
    });
    if (popularSort) return [...base].sort((a, b) => (offerCounts[b.id] || 0) - (offerCounts[a.id] || 0));
    return base;
  }, [puzzles, nbiFilter, seatFilter, dateFilter, partyOnly, popularSort, offerCounts, hideOffered, myOfferedPuzzleIds]);

  // 조각 모드: 파트너 직통(host_is_md) 조각을 목록 맨 위 고정 섹션으로 분리(날짜 빠른 순).
  // 나머지(listPuzzles)는 그 아래에서 기존 날짜순/정렬 그대로 노출 — "파트너 먼저 → 그 다음 날짜순".
  const pinnedPartnerPuzzles = useMemo(
    () =>
      shareMode
        ? [...filteredPuzzles.filter((p) => p.host_is_md)].sort(
            (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
          )
        : [],
    [filteredPuzzles, shareMode]
  );
  const listPuzzles = useMemo(
    () => (shareMode ? filteredPuzzles.filter((p) => !p.host_is_md) : filteredPuzzles),
    [filteredPuzzles, shareMode]
  );
  // 클럽×날짜 단위 묶음(더보기 클럽 다이렉트 탭과 홈 캐러셀 기준 통일).
  // 클럽이 지정되지 않은 파트너 조각은 묶을 대상이 없어 여기서 제외되고, orphanPartnerPuzzles로 별도 렌더.
  const partnerClubGroups = useMemo(
    () => (clubDirectMode === "hidden" ? [] : groupPuzzlesByClub(pinnedPartnerPuzzles, { byDate: true })),
    [pinnedPartnerPuzzles, clubDirectMode]
  );
  // club_id 없는 파트너 조각 — groupPuzzlesByClub이 버리고 listPuzzles(!host_is_md)에도 안 걸려
  // 기존엔 어디에도 노출되지 않던 항목. 클럽 다이렉트 탭에서는 섹션 하단에 개별 카드로 보정 노출한다.
  const orphanPartnerPuzzles = useMemo(
    () => (clubDirectMode === "only" ? pinnedPartnerPuzzles.filter((p) => !p.club_id) : []),
    [pinnedPartnerPuzzles, clubDirectMode]
  );

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
    const el = listEndRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setListEndVisible(entry.isIntersecting),
      { rootMargin: "0px 0px -80px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filteredPuzzles.length]);

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

  // 정렬 버튼 (빈 div — 헤더 레이아웃 유지용)
  const toggleButton = <div />;

  // 첫 보이는 헤더 우측에 붙이는 정렬 select
  // (모바일 칩 row와 겹침 방지 위해 헤더로 이동)
  const sortSelectEl = onSortModeChange ? (
    <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
      {/* MD 전용: 이미 오퍼 넣은 깃발 숨기고 새 것만 스캔 */}
      {(userRole === "md" || userRole === "admin") && (
        <button
          type="button"
          onClick={() => setHideOffered((v) => !v)}
          className={`text-[11px] font-bold px-3 h-7 leading-none rounded-full transition-colors whitespace-nowrap ${
            hideOffered
              ? "bg-inverse text-inverse-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          오퍼 안한 것만
        </button>
      )}
      <div className="relative flex-shrink-0">
        <select
          value={externalSortMode}
          onChange={(e) => onSortModeChange(e.target.value as "none" | "popular" | "budget" | "recent")}
          className={`appearance-none text-[11px] font-bold pl-3 pr-7 h-7 leading-none rounded-full transition-colors whitespace-nowrap cursor-pointer focus:outline-none box-border ${
            externalSortMode === "none"
              ? "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
              : "bg-inverse text-inverse-foreground"
          }`}
        >
          <option value="none">정렬</option>
          <option value="popular">인기순</option>
          <option value="budget">예산순</option>
          <option value="recent">최신순</option>
        </select>
        <ChevronDown className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 ${externalSortMode === "none" ? "text-muted-foreground" : "text-black"}`} />
      </div>
    </div>
  ) : null;

  return (
    <div className="relative">
      {/* 필터 아이콘 버튼: 부모(AuctionList)가 컨트롤하지 않을 때만 자체 노출.
          클럽 다이렉트 전용 목록은 인원/자리/날짜 필터가 카드 단위로 매핑되지 않아 숨긴다. */}
      {puzzles.length > 0 && onFilterOpenChange === undefined && clubDirectMode !== "only" && (
        <div className="flex items-center justify-end gap-1.5 mb-3">
          {hasActiveFilter && (
            <button
              onClick={() => {
                setNbiFilter("all");
                setSeatFilter("all");
                setDateFilter("all");
              }}
              className="text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors px-2"
            >
              초기화
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setFilterSheetOpen(true)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                hasActiveFilter
                  ? "bg-inverse text-inverse-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
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
        <SheetContent side="bottom" showCloseButton={false} className="bg-card border-border rounded-t-3xl px-5 pb-10">
          <SheetHeader className="pt-2 pb-4">
            <SheetTitle className="text-foreground font-black text-lg text-left">필터</SheetTitle>
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
            <div className="space-y-2">
              <p className="text-[12px] font-bold text-muted-foreground px-1">날짜</p>
              {/* 경매 필터와 동일한 달력. rangeMode: 시작일/종료일 두 번 탭으로 기간 선택,
                  한 번만 탭하면 그 날짜 하루만 필터된다. */}
              <DateFilterCalendar
                eventDates={eventDates}
                value={dateFilter}
                onChange={(v) => setDateFilter(v)}
                rangeMode
              />
            </div>
            {nbiFilter === "value" && (
              <p className="text-[11px] text-brand-amber dark:text-brand-amber/80 px-1">
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
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-transparent pointer-events-none"
                }`}
              >
                초기화
              </button>
            </div>
            <button
              onClick={() => setFilterSheetOpen(false)}
              className="w-full h-16 bg-inverse text-inverse-foreground font-black text-[14px] rounded-2xl"
            >
              {filteredPuzzles.length}건 보기
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── 파트너 직통 고정 섹션 — 클럽×날짜로 묶어 카드 수를 억제(Migration 505) ── */}
      {shareMode && clubDirectMode !== "hidden" && (partnerClubGroups.length > 0 || orphanPartnerPuzzles.length > 0) && (
        <div className={`space-y-2 ${clubDirectMode === "only" ? "mb-0" : "mb-8"}`}>
          <ClubDirectHeader />
          <div className="flex flex-col gap-5">
            {partnerClubGroups.map((group) => (
              <ClubDirectCard
                key={`${group.clubId}-${group.eventDate ?? ""}`}
                group={group}
                showBadge={false}
                sheetPuzzles={pinnedPartnerPuzzles.filter((p) => p.club_id === group.clubId)}
              />
            ))}
            {orphanPartnerPuzzles.map((puzzle) => (
              <Link key={puzzle.id} href={`/flags/${puzzle.id}`} className="block" onClick={(e) => { e.stopPropagation(); }}>
                <PuzzleCard puzzle={puzzle} userRole={userRole} offerCount={offerCounts[puzzle.id] || 0}
                  isMember={myPuzzleIds.has(puzzle.id)} hasOffered={myOfferedPuzzleIds.has(puzzle.id)}
                  onJoin={(p) => setJoinTarget(p)} onUnlock={(p) => setUnlockTarget(p)} />
              </Link>
            ))}
          </div>
          {clubDirectMode !== "only" && listPuzzles.length > 0 && <div className="border-t border-border mt-2" />}
        </div>
      )}

      {clubDirectMode === "only" ? (
        filteredPuzzles.length === 0 && !(hideEmptyState && !hasActiveFilter) && (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <div className="space-y-2 text-center">
              {hasActiveFilter ? (
                <>
                  <p className="text-[15px] font-bold text-foreground/80">조건에 맞는 클럽 다이렉트가 없어요</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">필터를 조정해보세요</p>
                  <button
                    onClick={() => {
                      setNbiFilter("all");
                      setSeatFilter("all");
                      setDateFilter("all");
                    }}
                    className="inline-flex items-center gap-1.5 mt-3 bg-muted hover:bg-muted text-foreground rounded-full px-5 py-2 text-[12px] font-bold transition-colors"
                  >
                    필터 초기화
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[40px] leading-none">🍾</span>
                  <p className="text-[15px] font-bold text-foreground">아직 클럽 다이렉트가 없어요</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">파트너 클럽이 자리를 올리면 여기에 표시돼요</p>
                </>
              )}
            </div>
          </div>
        )
      ) : filteredPuzzles.length === 0 ? (
        hideEmptyState && !hasActiveFilter ? null : (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <div className="absolute top-0 right-0">{toggleButton}</div>
          <div className="space-y-2 text-center">
            {hasActiveFilter ? (
              <>
                <p className="text-[15px] font-bold text-foreground/80">조건에 맞는 퍼즐이 없어요</p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">필터를 조정해보세요</p>
                <button
                  onClick={() => {
                    setNbiFilter("all");
                    setSeatFilter("all");
                    setDateFilter("all");
                  }}
                  className="inline-flex items-center gap-1.5 mt-3 bg-muted hover:bg-muted text-foreground rounded-full px-5 py-2 text-[12px] font-bold transition-colors"
                >
                  필터 초기화
                </button>
              </>
            ) : shareMode ? (
              <>
                <span className="text-[40px] leading-none">🎉</span>
                <p className="text-[15px] font-bold text-foreground">아직 등록된 파티가 없어요</p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">먼저 파티를 올려서 인원을 모아보세요</p>
                {userRole !== "md" && userRole !== "admin" && (
                  <Link
                    href={userRole ? "/shares/new" : "/login?redirect=/shares/new"}
                    className="inline-flex items-center gap-1.5 mt-3 bg-amber-500 hover:bg-amber-400 text-black rounded-full px-5 py-2.5 text-[13px] font-black transition-colors"
                  >
                    🎉 파티 등록하기
                  </Link>
                )}
              </>
            ) : null}
          </div>
        </div>
        )
      ) : (popularSort || recentSort || budgetSort) ? (
        /* 인기순/최신순/예산순: 날짜 그룹 헤더 유지 + 정렬 */
        <div className="pb-24 -mt-3">
          {Object.entries(
            listPuzzles.reduce((groups, puzzle) => {
              const date = puzzle.event_date;
              if (!groups[date]) groups[date] = [];
              groups[date].push(puzzle);
              return groups;
            }, {} as Record<string, Puzzle[]>)
          )
            .sort(([, aItems], [, bItems]) => {
              if (recentSort) {
                const maxA = Math.max(...aItems.map(p => new Date(p.created_at).getTime()));
                const maxB = Math.max(...bItems.map(p => new Date(p.created_at).getTime()));
                return maxB - maxA;
              }
              if (budgetSort) {
                const getBudget = (p: Puzzle) => p.total_budget ?? (p.budget_per_person * p.target_count);
                const maxA = Math.max(...aItems.map(getBudget));
                const maxB = Math.max(...bItems.map(getBudget));
                return maxB - maxA;
              }
              const maxA = Math.max(...aItems.map(p => offerCounts[p.id] || 0));
              const maxB = Math.max(...bItems.map(p => offerCounts[p.id] || 0));
              return maxB - maxA;
            })
            .map(([date, items], idx) => {
              const getBudget = (p: Puzzle) => p.total_budget ?? (p.budget_per_person * p.target_count);
              const sorted = recentSort
                ? [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                : budgetSort
                  ? [...items].sort((a, b) => getBudget(b) - getBudget(a))
                  : [...items].sort((a, b) => (offerCounts[b.id] || 0) - (offerCounts[a.id] || 0));
              const d = new Date(date + "T00:00:00");
              const days = ["일","월","화","수","목","금","토"];
              const dateLabel = `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
              const dday = getDDayLabel(date);
              return (
                <div key={date}>
                  {/* 파티(AuctionList)과 동일한 날짜 헤더·카드 간격 */}
                  <div className="flex items-center gap-2.5 px-1 pt-1 pb-0 mb-1.5">
                    <div className="w-1 h-[14px] bg-amber-500 rounded-full mt-[1px] flex-shrink-0" />
                    <h3 className="text-[16px] font-black text-foreground tracking-tight whitespace-nowrap">{dateLabel}</h3>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full mt-[1px] whitespace-nowrap flex-shrink-0 ${dday === "오늘" ? "bg-amber-500/20 text-brand-amber" : "bg-muted text-muted-foreground"}`}>{dday}</span>
                    {idx === 0 && sortSelectEl}
                  </div>
                  <div className="flex flex-col gap-6">
                    {sorted.map((puzzle) => (
                      <Link key={puzzle.id} href={`/flags/${puzzle.id}`} className="block" onClick={(e) => { e.stopPropagation(); }}>
                        <PuzzleCard puzzle={puzzle} userRole={userRole} offerCount={offerCounts[puzzle.id] || 0}
                          isMember={myPuzzleIds.has(puzzle.id)} hasOffered={myOfferedPuzzleIds.has(puzzle.id)}
                          onJoin={(p) => setJoinTarget(p)} onUnlock={(p) => setUnlockTarget(p)}
                          preferredClubNames={preferredClubNames} myClubIds={myClubIds} />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        <div className="space-y-8 pb-24">
          {/* 🆕 방금 올라온 퍼즐/깃발 — 상단 별도 섹션 */}
          {(() => {
            // 등록 후 6시간 이내 깃발만 "방금 꽂힌 깃발" 섹션에 노출
            const RECENT_THRESHOLD_MS = 6 * 60 * 60 * 1000;
            const now = Date.now();
            // MD: 오퍼할 수 있는 깃발 상태(직접 등록 깃발 + 인원 충족된 퍼즐)만
            // 유저/비로그인: 모든 최근 퍼즐 (퍼즐/깃발 둘 다)
            const recentPuzzles = listPuzzles
              .filter(p => now - new Date(p.created_at).getTime() < RECENT_THRESHOLD_MS)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const recentTitle = shareMode ? "방금 올라온 파티" : "방금 꽂힌 깃발";
            // "방금 꽂힌 깃발"에 노출된 깃발은 아래 날짜별 전체 목록에서 제외 (중복 방지)
            const recentIds = new Set(recentPuzzles.map(p => p.id));
            const rest = listPuzzles.filter(p => !recentIds.has(p.id));

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
                          className="flex items-center gap-1.5 text-[16px] font-black text-foreground tracking-tight hover:text-foreground/80 transition-colors whitespace-nowrap"
                          aria-label={recentCollapsed ? "펼치기" : "접기"}
                        >
                          {recentTitle}
                          {recentCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>
                        {sortSelectEl}
                      </div>
                      {recentDeadline && (
                        <p
                          suppressHydrationWarning
                          className="text-[12px] font-semibold text-muted-foreground pl-4 leading-none"
                        >
                          {recentDeadline}
                        </p>
                      )}
                    </div>
                    {!recentCollapsed && (
                      <div className="space-y-6">
                        {Object.entries(
                          recentPuzzles.reduce((groups, puzzle) => {
                            const date = puzzle.event_date;
                            if (!groups[date]) groups[date] = [];
                            groups[date].push(puzzle);
                            return groups;
                          }, {} as Record<string, Puzzle[]>)
                        )
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([date, items]) => {
                            const d = new Date(date + "T00:00:00");
                            const days = ["일","월","화","수","목","금","토"];
                            const dateLabel = `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
                            const dday = getDDayLabel(date);
                            return (
                              <div key={date} className="space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                  <div className="w-1 h-[14px] bg-amber-500 rounded-full flex-shrink-0" />
                                  <span className="text-[14px] font-black text-foreground tracking-tight">{dateLabel}</span>
                                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${dday === "오늘" ? "bg-amber-500/20 text-brand-amber" : "bg-muted text-muted-foreground"}`}>{dday}</span>
                                </div>
                                {items.map((puzzle) => (
                                  <Link key={puzzle.id} href={`/flags/${puzzle.id}`} className="block" onClick={(e) => { e.stopPropagation(); trackEvent('puzzle_card_click', { puzzle_id: puzzle.id, area: puzzle.area, is_recruiting: puzzle.is_recruiting_party, source: 'recent' }); }}>
                                    <PuzzleCard puzzle={puzzle} userRole={userRole} offerCount={offerCounts[puzzle.id] || 0}
                                      isMember={myPuzzleIds.has(puzzle.id)} hasOffered={myOfferedPuzzleIds.has(puzzle.id)}
                                      onJoin={(p) => setJoinTarget(p)} onUnlock={(p) => setUnlockTarget(p)} />
                                  </Link>
                                ))}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  {recentPuzzles.length > 0 && rest.length > 0 && (
                    <div className="border-t border-border mt-2" />
                  )}
                  </div>
                )}
                <div className="flex flex-col gap-6">
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
              const items = rawItems;
              const d = new Date(date + "T00:00:00");
              const m = d.getMonth() + 1;
              const day = d.getDate();
              const days = ["일", "월", "화", "수", "목", "금", "토"];
              const dateLabel = `${m}월 ${day}일 (${days[d.getDay()]})`;

              const dday = getDDayLabel(date);
              const deadline = getPuzzleGroupDeadline(items);

              return (
                <div key={date}>
                  <div className="flex flex-col gap-1.5 px-1 pt-1 pb-0 mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-1 h-[14px] bg-amber-500 rounded-full mt-[1px] flex-shrink-0" />
                      <h3 className="text-[16px] font-black text-foreground tracking-tight whitespace-nowrap">{dateLabel}</h3>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full mt-[1px] whitespace-nowrap flex-shrink-0 ${
                          dday === "오늘"
                            ? "bg-amber-500/20 text-brand-amber"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {dday}
                      </span>
                      {groupIdx === 0 && recentPuzzles.length === 0 && sortSelectEl}
                    </div>
                    {deadline && (
                      <p
                        suppressHydrationWarning
                        className="text-[12px] font-semibold text-muted-foreground pl-3 leading-none"
                      >
                        {deadline}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-6">
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
                          preferredClubNames={preferredClubNames}
                          myClubIds={myClubIds}
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
              </div>
              </>
            );
          })()}
        </div>
      )}

      {/* 리스트 끝 sentinel — floating CTA fade-out 트리거 */}
      {filteredPuzzles.length > 0 && (
        <div ref={listEndRef} aria-hidden className="h-px w-full" />
      )}

      {/* Floating CTA 버튼 (MD 제외) — 빈 상태/리스트 끝 도달 시 숨김. 깃발 분기는 제거(shareMode만 노출) */}
      {shareMode && clubDirectMode !== "only" && userRole !== "md" && filteredPuzzles.length > 0 && (
        <Link
          href={userRole ? "/shares/new" : "/login?redirect=/shares/new"}
          onClick={() => trackEvent("puzzle_cta_click", { source: "list_float" })}
          className={`fixed bottom-24 right-4 flex items-center gap-2 bg-inverse hover:opacity-90 text-inverse-foreground rounded-full pl-4 pr-3 py-3 shadow-lg z-40 border-2 border-black transition-opacity duration-200 ${
            listEndVisible ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <span className="text-black text-sm font-semibold whitespace-nowrap">
            파티 올리기
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
