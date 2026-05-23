"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Wine, ChevronLeft, ChevronRight, Map as MapIcon, LayoutGrid } from "lucide-react";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";
import { ClubFilterChips, type ClubFilters } from "./ClubFilterChips";
import { ClubMap } from "./ClubMap";
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
    () => (searchParams.get("view") === "map" ? "map" : "list")
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.areas.length) params.set("area", filters.areas.join(","));
    if (filters.genres.length) params.set("genre", filters.genres.join(","));
    if (view === "map") params.set("view", "map");
    const qs = params.toString();
    const url = qs ? `/clubs?${qs}` : "/clubs";
    router.replace(url, { scroll: false });
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

  const filtered = useMemo(() => {
    return dedupedClubs.filter((c) => {
      if (filters.areas.length && !filters.areas.includes(c.area || ""))
        return false;
      if (filters.genres.length) {
        const wanted = filters.genres.map((g) => makeTag("genre", g));
        if (!wanted.some((t) => c.tags?.includes(t))) return false;
      }
      return true;
    });
  }, [dedupedClubs, filters]);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <ClubFilterChips value={filters} onChange={setFilters} />
        </div>
        <div className="flex items-center bg-neutral-900 rounded-full p-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setView("list")}
            aria-label="리스트 보기"
            aria-pressed={view === "list"}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
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
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
              view === "map" ? "bg-white text-black" : "text-neutral-400"
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {view === "map" ? (
        <div className="space-y-2">
          <ClubMap clubs={filtered} activeCountMap={activeCountMap} />
          {mappableCount < filtered.length && (
            <p className="text-[11px] text-neutral-500 text-center px-2">
              좌표 미등록 클럽 {filtered.length - mappableCount}곳은 지도에 표시되지 않아요
            </p>
          )}
        </div>
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
