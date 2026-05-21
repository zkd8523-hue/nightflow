"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Wine } from "lucide-react";
import { ClubFilterChips, type ClubFilters } from "./ClubFilterChips";
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
}

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

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.areas.length) params.set("area", filters.areas.join(","));
    if (filters.genres.length) params.set("genre", filters.genres.join(","));
    const qs = params.toString();
    const url = qs ? `/clubs?${qs}` : "/clubs";
    router.replace(url, { scroll: false });
  }, [filters, router]);

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

  return (
    <div className="space-y-6">
      <ClubFilterChips value={filters} onChange={setFilters} />

      {filtered.length === 0 ? (
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
  return (
    <section>
      <h2 className="text-[15px] font-black text-white mb-3 px-1 flex items-baseline gap-2">
        {area}
        <span className="text-neutral-500 text-[11px] font-medium">
          {clubs.length}
        </span>
      </h2>
      <div className="-mx-4 px-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 snap-x snap-mandatory">
          {clubs.map((club) => (
            <ClubCard key={club.id} club={club} />
          ))}
        </div>
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
      className="flex-shrink-0 w-[152px] snap-start group"
    >
      <div className="relative w-[152px] h-[190px] rounded-2xl overflow-hidden bg-neutral-900">
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
        {club.drink_menu_url && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
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
