"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Map as MapIcon, LayoutGrid, Search, X, ArrowLeft, Heart, SlidersHorizontal } from "lucide-react";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";
import { ClubFilterChips, ClubAreaChips, type ClubFilters } from "./ClubFilterChips";
import { ClubMap } from "./ClubMap";
import { createClient } from "@/lib/supabase/client";
import {
  FEATURE_GROUPS,
  getTagsByGroup,
  makeTag,
  AREA_OPTIONS,
} from "@/lib/clubs/tags";
import { getClubAliases } from "@/lib/clubs/aliases";
import { benefitLabel } from "@/lib/utils/hotdeal";
import { distanceKm } from "@/lib/chat/areas";
import { getCurrentCoords } from "@/lib/geo/currentCoords";

/** 3km 이내면 표시 */
const NEAR_KM_THRESHOLD = 3;

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
  hotdealMap?: Record<string, string>;
  benefitTagsMap?: Record<string, string[]>;
  favCountMap?: Record<string, number>;
}

function parseList(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ClubList({ clubs, activeCountMap, hotdealMap = {}, benefitTagsMap = {}, favCountMap = {} }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<ClubFilters>(() => ({
    areas: parseList(searchParams.get("area")),
    genres: parseList(searchParams.get("genre")),
    venueTypes: parseList(searchParams.get("venue_type")),
  }));
  const [view, setView] = useState<ViewMode>(
    () => (searchParams.get("view") === "map" ? "map" : "list")
  );
  const [query, setQuery] = useState("");
  // 지도 모드에서 클럽 상세 모달이 열렸는지 — 열리면 검색/필터 overlay 숨김
  const [mapDetailOpen, setMapDetailOpen] = useState(false);
  // 필터는 기본 접힘 (사용자 명시 요청)
  const [filtersOpen, setFiltersOpen] = useState(false);

  // 유저 GPS — 3km 이내 클럽에 거리 배지 표시.
  // Capacitor 네이티브에선 권한 팝업 자동 요청, 웹은 브라우저 팝업. 실패해도 조용히 넘어감.
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCurrentCoords()
      .then((c) => {
        if (!cancelled) setUserCoords({ lat: c.latitude, lng: c.longitude });
      })
      .catch(() => { /* silent — 배지만 안 뜨고 기능 정상 */ });
    return () => { cancelled = true; };
  }, []);

  // 지역(area)은 1차 필터로 항상 노출되므로 세부 필터 카운트에서 제외
  const activeFilterCount =
    filters.genres.length + filters.venueTypes.length;

  const changeView = (next: ViewMode) => {
    setView(next);
  };

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.areas.length) params.set("area", filters.areas.join(","));
    if (filters.genres.length) params.set("genre", filters.genres.join(","));
    if (filters.venueTypes.length) params.set("venue_type", filters.venueTypes.join(","));
    if (view === "map") params.set("view", "map");
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
      if (filters.venueTypes.length) {
        const wanted = filters.venueTypes.map((v) => makeTag("venue_type", v));
        if (!wanted.some((t) => c.tags?.includes(t))) return false;
      }
      if (normalizedQuery) {
        // DB clubs.aliases + 정적 CLUB_ALIASES 매핑(aliases.ts) 둘 다 매칭.
        // 정적 매핑에 "에이스", "버뮤다", "디엠" 등 한글 별칭 등록됨.
        const staticAliases = getClubAliases(c.id);
        const haystack = [
          c.name,
          c.area || "",
          ...(c.aliases || []),
          ...staticAliases,
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

  // 정렬 (각 area 내):
  // 1) 오늘 혜택(hotdealMap or benefitTagsMap) 있는 클럽 최상위
  // 2) 그 안에서 active 깃발 많은 순
  // 3) 혜택 없는 클럽은 일별 시드 기반 셔플(매일 노출 순서 변경, 같은 날에는 안정)
  const hasBenefit = (id: string) =>
    !!hotdealMap[id] || (benefitTagsMap[id]?.length ?? 0) > 0;
  // KST 기준 YYYYMMDD 시드 (자정에 순서 변경)
  const kstNowForSeed = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const daySeed =
    kstNowForSeed.getUTCFullYear() * 10000 +
    (kstNowForSeed.getUTCMonth() + 1) * 100 +
    kstNowForSeed.getUTCDate();
  // id+seed → 결정적 해시 (xorshift 기반)
  const hashForSort = (id: string, seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17; h >>>= 0;
    h ^= h << 5;  h >>>= 0;
    return h;
  };
  for (const area of Object.keys(byArea)) {
    byArea[area].sort((a, b) => {
      const ab = hasBenefit(a.id) ? 1 : 0;
      const bb = hasBenefit(b.id) ? 1 : 0;
      if (ab !== bb) return bb - ab;
      // 혜택 그룹 안에서는 active 깃발 많은 순 우선, 동률이면 일별 셔플
      const aa = activeCountMap[a.id] || 0;
      const bbn = activeCountMap[b.id] || 0;
      if (aa !== bbn) return bbn - aa;
      return hashForSort(a.id, daySeed) - hashForSort(b.id, daySeed);
    });
  }

  const orderedAreas: string[] = (AREA_OPTIONS as readonly string[]).filter(
    (a) => byArea[a]?.length
  );
  // "기타"가 있다면 마지막에 추가
  if (byArea["기타"]?.length) orderedAreas.push("기타");

  const mappableCount = filtered.filter((c) => c.latitude != null && c.longitude != null).length;

  // 클럽별 거리(km) — 유저 GPS + 클럽 좌표 있을 때만 계산, 3km 이내만 저장
  const distanceMap = useMemo<Record<string, number>>(() => {
    if (!userCoords) return {};
    const out: Record<string, number> = {};
    for (const c of clubs) {
      if (c.latitude == null || c.longitude == null) continue;
      const d = distanceKm(userCoords.lat, userCoords.lng, c.latitude, c.longitude);
      if (d <= NEAR_KM_THRESHOLD) out[c.id] = d;
    }
    return out;
  }, [clubs, userCoords]);

  return (
    <div className={view === "map" ? "space-y-0" : "space-y-6"}>
      {view === "list" && (
        <header className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="뒤로가기"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-card -ml-2"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">
            전국 클럽 가이드
          </h1>
        </header>
      )}
      {/* 통합 상단바: 검색 + 필터 + view 토글 하나의 카드처럼
          map 모드에서는 지도 위 floating overlay로 표시.
          지도에서 클럽 상세 모달이 열리면 검색/필터 숨김. */}
      {!(view === "map" && mapDetailOpen) && (
      <div
        className={`${
          view === "map"
            ? // 뷰포트 전체가 아니라 콘텐츠 폭(max-w-3xl)에 맞춰 중앙정렬 —
              // 넓은 화면(데스크톱 브라우저)에서 검색바가 좌우로 삐져나가는 문제 방지
              "fixed left-1/2 -translate-x-1/2 w-[calc(100%-1rem)] max-w-3xl z-30 bg-card/90 backdrop-blur-md p-2.5 space-y-2 shadow-lg rounded-2xl"
            : "bg-card p-2.5 space-y-2 shadow-sm rounded-2xl border border-border"
        }`}
        style={
          view === "map"
            ? { top: "calc(env(safe-area-inset-top, 0px) + 8px)" }
            : undefined
        }
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {view === "map" && (
            <button
              type="button"
              onClick={() => changeView("list")}
              aria-label="목록으로"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-card hover:bg-muted active:scale-95 transition flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4 text-foreground" />
            </button>
          )}
          <div className="flex-1 min-w-0 flex items-center bg-card rounded-full pl-3 pr-1.5 h-9">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="클럽명·지역 검색"
              // text-[16px]: iOS 사파리 16px 미만 input 자동 확대(레이아웃 밀림) 방지
              className="flex-1 bg-transparent border-0 outline-none px-2 text-[16px] font-medium text-foreground placeholder:text-muted-foreground min-w-0"
              aria-label="클럽 검색"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
                className="w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {/* 필터 열기/닫기 토글 — 지도 모드에서 지도를 가리지 않게 접을 수 있음 */}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-label={filtersOpen ? "필터 닫기" : "필터 열기"}
            aria-expanded={filtersOpen}
            className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
              filtersOpen || activeFilterCount > 0
                ? "bg-inverse text-inverse-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {activeFilterCount > 0 && !filtersOpen && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-black text-[9px] font-black leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* 세그먼트 스위치 — 리스트/지도 양쪽 표시, 현재 상태 하이라이트 */}
          <div
            role="tablist"
            aria-label="보기 방식"
            className="flex items-center h-9 rounded-full bg-card p-0.5 flex-shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "list"}
              onClick={() => changeView("list")}
              className={`flex items-center justify-center gap-1 px-3 h-8 rounded-full text-[12px] font-black transition ${
                view === "list"
                  ? "bg-inverse text-inverse-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              리스트
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "map"}
              onClick={() => changeView("map")}
              className={`flex items-center justify-center gap-1 px-3 h-8 rounded-full text-[12px] font-black transition ${
                view === "map"
                  ? "bg-inverse text-inverse-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              지도
            </button>
          </div>
        </div>
        {/* 지역 필터는 항상 표시 (1차 필터) */}
        <ClubAreaChips value={filters} onChange={setFilters} />
        {/* 세부 필터(클럽/장르)는 토글로 펼침 */}
        {filtersOpen && <ClubFilterChips value={filters} onChange={setFilters} />}
      </div>
      )}

      {view === "map" ? (
        <ClubMap
          clubs={filtered}
          activeCountMap={activeCountMap}
          hotdealMap={hotdealMap}
          unmappedCount={filtered.length - mappableCount}
          activeAreas={filters.areas}
          onDetailOpenChange={setMapDetailOpen}
        />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground text-sm">
            조건에 맞는 클럽이 없습니다
          </p>
          <button
            type="button"
            onClick={() => setFilters({ areas: [], genres: [], venueTypes: [] })}
            className="text-xs font-bold text-foreground bg-muted hover:bg-muted px-4 py-2 rounded-full"
          >
            필터 초기화
          </button>
        </div>
      ) : (
        <div className="space-y-7">
          {orderedAreas.map((area) => {
            const list = byArea[area];
            if (!list || list.length === 0) return null;
            return (
              <AreaCarousel
                key={area}
                area={area}
                clubs={list}
                favCountMap={favCountMap}
                hotdealMap={hotdealMap}
                benefitTagsMap={benefitTagsMap}
                distanceMap={distanceMap}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function AreaCarousel({
  area,
  clubs,
  favCountMap = {},
  hotdealMap = {},
  benefitTagsMap = {},
  distanceMap = {},
}: {
  area: string;
  clubs: ClubListItem[];
  favCountMap?: Record<string, number>;
  hotdealMap?: Record<string, string>;
  benefitTagsMap?: Record<string, string[]>;
  distanceMap?: Record<string, number>;
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

  const HOTPLACE_AREAS = ["강남", "홍대", "이태원", "부산", "광주", "대구"];
  const hasHotplace = HOTPLACE_AREAS.includes(area);

  return (
    <section>
      <h2 className="text-[15px] font-black text-foreground mb-3 px-1 flex items-center gap-2">
        {hasHotplace ? (
          <Link
            href={`/clubs?area=${encodeURIComponent(area)}`}
            className="inline-flex items-center gap-0.5 hover:text-brand-amber active:text-brand-amber transition-colors"
            aria-label={`${area} 클럽 전체 보기`}
          >
            {area}
            <ChevronRight className="w-4 h-4 text-muted-foreground -mb-0.5" strokeWidth={3} />
          </Link>
        ) : (
          area
        )}
        <span className="text-muted-foreground text-[11px] font-medium">
          {clubs.length}
        </span>
      </h2>
      <div className="-mx-4 px-4 relative group">
        <div ref={scrollRef} data-no-pull-refresh className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 snap-x snap-mandatory touch-pan-x touch-pan-y">
          {clubs.map((club) => (
            <ClubCard
              key={club.id}
              club={club}
              favCount={favCountMap[club.id] ?? 0}
              benefitText={hotdealMap[club.id] ?? null}
              benefitTags={benefitTagsMap[club.id] ?? []}
              distanceKm={distanceMap[club.id]}
            />
          ))}
        </div>
        {/* "더 있어요" 시각 힌트 — 우측 그라데이션 페이드 */}
        <div className="pointer-events-none absolute top-0 right-0 h-[175px] w-8 bg-gradient-to-l from-background to-transparent" />
        {/* 데스크톱 전용 좌우 버튼 */}
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="이전"
          className="hidden md:flex absolute left-1 top-[88px] -translate-y-1/2 w-10 h-10 rounded-full bg-black/70 backdrop-blur-sm border border-border items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90 z-10"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="다음"
          className="hidden md:flex absolute right-1 top-[88px] -translate-y-1/2 w-10 h-10 rounded-full bg-black/70 backdrop-blur-sm border border-border items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90 z-10"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}

function ClubCard({
  club,
  favCount = 0,
  benefitText = null,
  benefitTags = [],
  distanceKm: distance,
}: {
  club: ClubListItem;
  favCount?: number;
  benefitText?: string | null;
  benefitTags?: string[];
  distanceKm?: number;
}) {
  const genres = getTagsByGroup(club.tags || [], "genre");
  const metaLine = genres.slice(0, 2).map((g) => `#${g.label}`).join(" · ");

  return (
    <Link
      href={`/clubs/${club.id}`}
      className="flex-shrink-0 w-[140px] snap-start snap-always group/card"
    >
      <div className="relative w-[140px] h-[175px] rounded-2xl overflow-hidden bg-card">
        {club.thumbnail_url ? (
          <Image
            src={club.thumbnail_url}
            alt={`${club.area ? `${club.area} ` : ""}${club.name} 클럽 사진`}
            fill
            sizes="152px"
            className="object-cover group-active/card:scale-95 transition-transform"
            loading="lazy"
          />
        ) : (
          <ImageFallback name={club.name} />
        )}
        {/* 찜 버튼 */}
        <div className="absolute top-2 right-2 z-10">
          <FavoriteButton clubId={club.id} />
        </div>
        {/* 상단 혜택 배지 — 홈(ClubBenefitSection)과 동일 디자인 (폰트·정렬 통일) */}
        {benefitText && (
          <div className="absolute top-0 inset-x-0 bg-amber-500 px-2.5 pt-1.5 pb-1">
            <span
              className="block whitespace-pre-line text-black text-[13px] tracking-tight text-center leading-[1.1] line-clamp-2"
              style={{ fontFamily: "var(--font-display-kr)" }}
            >
              {benefitText}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background/80 to-transparent" />
        {distance !== undefined && (
          <span className="absolute bottom-2 left-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-foreground text-[10px] font-black leading-none">
            {distance < 1
              ? `${Math.round(distance * 1000)}m`
              : `${distance.toFixed(1)}km`}
          </span>
        )}
      </div>
      <div className="mt-2 px-0.5 space-y-0.5">
        <div className="flex items-center justify-between gap-1.5">
          <p className="text-foreground text-[14px] font-black truncate flex-1">
            {club.name}
          </p>
          {favCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-red-500 font-bold shrink-0">
              <Heart className="w-3 h-3 fill-red-500 stroke-none" />
              {favCount}
            </span>
          )}
        </div>
        {metaLine && (
          <p className="text-muted-foreground text-[11px] font-medium truncate">
            {metaLine}
          </p>
        )}
        {benefitTags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {benefitTags.slice(0, 3).map((tag) => {
              const { label, emoji } = benefitLabel(tag);
              return (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-brand-amber border border-amber-500/30 text-[9px] font-black leading-none"
                >
                  {emoji && <span>{emoji}</span>}
                  {label}
                </span>
              );
            })}
          </div>
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
      <span className="text-[40px] font-black text-foreground/40 select-none">
        {initial}
      </span>
    </div>
  );
}
