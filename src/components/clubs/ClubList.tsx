"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Wine, ChevronLeft, ChevronRight, Map as MapIcon, LayoutGrid, Search, X, ArrowLeft } from "lucide-react";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";
import { ClubFilterChips, type ClubFilters } from "./ClubFilterChips";
import { ClubMap } from "./ClubMap";
import { createClient } from "@/lib/supabase/client";
import {
  FEATURE_GROUPS,
  getTagsByGroup,
  makeTag,
  AREA_OPTIONS,
} from "@/lib/clubs/tags";

interface ClubListItem {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  tags: string[];
  drink_menu_url: string | null;
  latitude?: number | null;
  longitude?: number | null;
  operating_hours?: string | null;
  entry_fee_detail?: string | null;
  aliases?: string[];
}

/** 검색용 정규화 — 소문자 + 양끝 공백 제거 + 연속 공백 1개 */
function normalizeSearch(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

type ViewMode = "list" | "map";

interface Props {
  clubs: ClubListItem[];
  activeCountMap: Record<string, number>;
}

function parseList(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ClubList({ clubs, activeCountMap }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<ClubFilters>(() => ({
    areas: parseList(searchParams.get("area")),
    genres: parseList(searchParams.get("genre")),
  }));
  const [view, setView] = useState<ViewMode>(
    () => (searchParams.get("view") === "list" ? "list" : "map")
  );
  const [query, setQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.areas.length) params.set("area", filters.areas.join(","));
    if (filters.genres.length) params.set("genre", filters.genres.join(","));
    if (view === "list") params.set("view", "list");
    const qs = params.toString();
    const url = qs ? `/clubs?${qs}` : "/clubs";
    router.replace(url, { scroll: false });
    // Header/layout이 view 변경을 감지해 자기 표시 여부를 다시 계산
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("club-view-change", { detail: { view } })
      );
    }
  }, [filters, view, router]);

  // 같은 클럽 중복 등록 처리 (DB 노터치, 프론트에서만 숨김)
  // - 정규화: lowercase + "club " 접두/접미 제거
  // - 같은 정규화명 그룹에서 이미지 있는 게 하나라도 있으면, 이미지 없는 건 숨김
  const dedupedClubs = useMemo(() => {
    const normalize = (name: string) =>
      name
        .toLowerCase()
        .trim()
        .replace(/^club\s+/, "")
        .replace(/\s+club$/, "")
        .trim();

    const groups = new Map<string, ClubListItem[]>();
    for (const c of clubs) {
      const key = normalize(c.name);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }

    const hiddenIds = new Set<string>();
    for (const group of groups.values()) {
      if (group.length <= 1) continue;
      const hasImage = group.some((c) => c.thumbnail_url);
      if (hasImage) {
        for (const c of group) {
          if (!c.thumbnail_url) hiddenIds.add(c.id);
        }
      }
    }

    return clubs.filter((c) => !hiddenIds.has(c.id));
  }, [clubs]);

  const normalizedQuery = normalizeSearch(query);
  const filtered = useMemo(() => {
    return dedupedClubs.filter((c) => {
      if (filters.areas.length && !filters.areas.includes(c.area || ""))
        return false;
      if (filters.genres.length) {
        const wanted = filters.genres.map((g) => makeTag("genre", g));
        if (!wanted.some((t) => c.tags?.includes(t))) return false;
      }
      if (normalizedQuery) {
        const haystack = [
          c.name,
          c.area || "",
          ...(c.aliases || []),
        ]
          .map(normalizeSearch)
          .join("  ");
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [dedupedClubs, filters, normalizedQuery]);

  // 검색 실패 로깅: 쿼리 입력 후 500ms 안정 + 결과 0건이면 1회 기록
  useEffect(() => {
    if (!normalizedQuery) return;
    if (normalizedQuery.length < 2) return;
    if (filtered.length > 0) return;
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient();
        await supabase.rpc("log_search_miss", {
          p_query: query,
          p_normalized: normalizedQuery,
          p_result_count: 0,
        });
      } catch {
        // 로깅 실패는 조용히 무시 (UX 영향 X)
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [normalizedQuery, filtered.length, query]);

  const byArea: Record<string, ClubListItem[]> = {};
  for (const c of filtered) {
    const area = c.area || "기타";
    (byArea[area] ||= []).push(c);
  }

  // 정렬: 깃발 많은 순 (각 area 내)
  for (const area of Object.keys(byArea)) {
    byArea[area].sort(
      (a, b) => (activeCountMap[b.id] || 0) - (activeCountMap[a.id] || 0)
    );
  }

  const orderedAreas: string[] = (AREA_OPTIONS as readonly string[]).filter(
    (a) => byArea[a]?.length
  );
  // "기타"가 있다면 마지막에 추가
  if (byArea["기타"]?.length) orderedAreas.push("기타");

  const mappableCount = filtered.filter((c) => c.latitude != null && c.longitude != null).length;

  return (
    <div className={view === "map" ? "space-y-0" : "space-y-6"}>
      {view === "list" && (
        <header className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="뒤로가기"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-neutral-900 -ml-2"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
            전국 클럽 가이드
          </h1>
        </header>
      )}
      {/* 통합 상단바: 검색 + 필터 + view 토글 하나의 카드처럼
          map 모드에서는 지도 위 floating overlay로 표시 */}
      <div
        className={`${
          view === "map"
            ? "fixed left-0 right-0 z-30 bg-[#1C1C1E]/85 backdrop-blur-md p-2.5 space-y-2 shadow-lg"
            : "bg-[#1C1C1E] p-2.5 space-y-2 shadow-sm rounded-2xl"
        }`}
        style={
          view === "map"
            ? { top: "calc(env(safe-area-inset-top, 0px))" }
            : undefined
        }
      >
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-neutral-900 rounded-full pl-3 pr-1.5 h-9">
            <Search className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="클럽명·지역 검색"
              className="flex-1 bg-transparent border-0 outline-none px-2 text-[13px] font-medium text-white placeholder:text-neutral-500 min-w-0"
              aria-label="클럽 검색"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
                className="w-6 h-6 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center bg-neutral-900 rounded-full p-0.5 flex-shrink-0 h-9">
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="리스트 보기"
              aria-pressed={view === "list"}
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                view === "list" ? "bg-white text-black" : "text-neutral-400"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              aria-label="지도 보기"
              aria-pressed={view === "map"}
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                view === "map" ? "bg-white text-black" : "text-neutral-400"
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <ClubFilterChips value={filters} onChange={setFilters} />
      </div>

      {view === "map" ? (
        <ClubMap
          clubs={filtered}
          activeCountMap={activeCountMap}
          unmappedCount={filtered.length - mappableCount}
        />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-neutral-400 text-sm">
            조건에 맞는 클럽이 없습니다
          </p>
          <button
            type="button"
            onClick={() => setFilters({ areas: [], genres: [] })}
            className="text-xs font-bold text-white bg-neutral-800 hover:bg-neutral-700 px-4 py-2 rounded-full"
          >
            필터 초기화
          </button>
        </div>
      ) : (
        <div className="space-y-7">
          {orderedAreas.map((area) => {
            const list = byArea[area];
            if (!list || list.length === 0) return null;
            return <AreaCarousel key={area} area={area} clubs={list} />;
          })}
        </div>
      )}
    </div>
  );
}

function AreaCarousel({
  area,
  clubs,
}: {
  area: string;
  clubs: ClubListItem[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const STEP = 152; // 카드 너비(140) + gap(12)
    const currentCard = Math.round(el.scrollLeft / STEP);
    const nextCard = Math.max(0, currentCard + dir);
    el.scrollTo({ left: nextCard * STEP, behavior: "smooth" });
  };

  return (
    <section>
      <h2 className="text-[15px] font-black text-white mb-3 px-1 flex items-baseline gap-2">
        {area}
        <span className="text-neutral-500 text-[11px] font-medium">
          {clubs.length}
        </span>
      </h2>
      <div className="-mx-4 px-4 relative group">
        <div ref={scrollRef} data-no-pull-refresh className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 snap-x snap-mandatory touch-pan-x">
          {clubs.map((club) => (
            <ClubCard key={club.id} club={club} />
          ))}
        </div>
        {/* "더 있어요" 시각 힌트 — 우측 그라데이션 페이드 */}
        <div className="pointer-events-none absolute top-0 right-0 h-[175px] w-8 bg-gradient-to-l from-[#0A0A0A] to-transparent" />
        {/* 데스크톱 전용 좌우 버튼 */}
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="이전"
          className="hidden md:flex absolute left-1 top-[88px] -translate-y-1/2 w-10 h-10 rounded-full bg-black/70 backdrop-blur-sm border border-neutral-700 items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90 z-10"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="다음"
          className="hidden md:flex absolute right-1 top-[88px] -translate-y-1/2 w-10 h-10 rounded-full bg-black/70 backdrop-blur-sm border border-neutral-700 items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90 z-10"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}

function ClubCard({ club }: { club: ClubListItem }) {
  const genres = getTagsByGroup(club.tags || [], "genre");
  const featureGroups = FEATURE_GROUPS.filter(
    (g) => g.group === "space" || g.group === "crowd"
  );
  const featureTags: string[] = [];
  for (const g of featureGroups) {
    const tags = getTagsByGroup(club.tags || [], g.group);
    if (tags.length) featureTags.push(tags[0].label);
  }

  const metaLine = [
    ...genres.slice(0, 2).map((g) => `#${g.label}`),
    ...featureTags.slice(0, 1),
  ].join(" · ");

  return (
    <Link
      href={`/clubs/${club.id}`}
      className="flex-shrink-0 w-[140px] snap-start snap-always group"
    >
      <div className="relative w-[140px] h-[175px] rounded-2xl overflow-hidden bg-neutral-900">
        {club.thumbnail_url ? (
          <Image
            src={club.thumbnail_url}
            alt={club.name}
            fill
            sizes="152px"
            className="object-cover group-active:scale-95 transition-transform"
          />
        ) : (
          <ImageFallback name={club.name} />
        )}
        {/* 찜 버튼 */}
        <div className="absolute top-2 right-2">
          <FavoriteButton clubId={club.id} />
        </div>
        {club.drink_menu_url && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
            <Wine className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-bold text-amber-400">주대표</span>
          </div>
        )}
        {/* 하단 그라데이션으로 텍스트 가독성 보강 */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-white text-[14px] font-black truncate">
          {club.name}
        </p>
        {metaLine && (
          <p className="text-neutral-500 text-[11px] font-medium truncate mt-0.5">
            {metaLine}
          </p>
        )}
      </div>
    </Link>
  );
}

function ImageFallback({ name }: { name: string }) {
  // 클럽명에서 첫 글자 + 이름 기반 색상 회전
  const initial = name.trim().charAt(0);
  // 이름 해시 → 0~3 인덱스
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % 4;
  const gradients = [
    "from-amber-900/40 via-neutral-900 to-black",
    "from-purple-900/40 via-neutral-900 to-black",
    "from-rose-900/40 via-neutral-900 to-black",
    "from-emerald-900/40 via-neutral-900 to-black",
  ];
  return (
    <div
      className={`w-full h-full bg-gradient-to-br ${gradients[hash]} flex items-center justify-center`}
    >
      <span className="text-[40px] font-black text-white/40 select-none">
        {initial}
      </span>
    </div>
  );
}
