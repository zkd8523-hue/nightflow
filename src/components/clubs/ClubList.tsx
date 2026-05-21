"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin, Wine } from "lucide-react";
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

  const filtered = useMemo(() => {
    return clubs.filter((c) => {
      if (filters.areas.length && !filters.areas.includes(c.area || ""))
        return false;
      if (filters.genres.length) {
        const wanted = filters.genres.map((g) => makeTag("genre", g));
        if (!wanted.some((t) => c.tags?.includes(t))) return false;
      }
      return true;
    });
  }, [clubs, filters]);

  const anyFilter = filters.areas.length > 0 || filters.genres.length > 0;

  const byArea: Record<string, ClubListItem[]> = {};
  for (const c of filtered) {
    const area = c.area || "기타";
    (byArea[area] ||= []).push(c);
  }

  const areaOrder: string[] = anyFilter
    ? Object.keys(byArea)
    : (AREA_OPTIONS as readonly string[]).filter((a) => byArea[a]?.length);

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
        <div className="space-y-8">
          {areaOrder.map((area) => {
            const list = byArea[area];
            if (!list || list.length === 0) return null;
            return (
              <section key={area}>
                <h2 className="text-base font-black text-white mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-500" />
                  {area}{" "}
                  <span className="text-neutral-500 text-xs font-medium">
                    ({list.length})
                  </span>
                </h2>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {list
                    .slice()
                    .sort(
                      (a, b) =>
                        (activeCountMap[b.id] || 0) -
                        (activeCountMap[a.id] || 0)
                    )
                    .map((club) => (
                      <ClubCard key={club.id} club={club} />
                    ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClubCard({ club }: { club: ClubListItem }) {
  const featureLine: string[] = [];
  if (club.area) featureLine.push(club.area);
  for (const group of FEATURE_GROUPS) {
    if (group.group === "crowd") continue; // crowd는 두 번째 줄
    const tags = getTagsByGroup(club.tags || [], group.group);
    if (tags.length) featureLine.push(tags.map((t) => t.label).join("/"));
  }

  const genreTags = getTagsByGroup(club.tags || [], "genre");
  const crowdTags = getTagsByGroup(club.tags || [], "crowd");
  const secondLine: string[] = [];
  if (genreTags.length)
    secondLine.push(genreTags.map((t) => `#${t.label}`).join(" "));
  if (crowdTags.length) secondLine.push(crowdTags.map((t) => t.label).join("/"));
  const hasMenu = !!club.drink_menu_url;

  return (
    <li>
      <Link
        href={`/clubs/${club.id}`}
        className="block bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 hover:border-neutral-600 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className="text-white font-bold truncate">{club.name}</h3>
            {featureLine.length > 0 && (
              <p className="text-[11px] text-neutral-400 truncate">
                {featureLine.join(" · ")}
              </p>
            )}
            {(secondLine.length > 0 || hasMenu) && (
              <p className="text-[11px] text-neutral-500 truncate flex items-center gap-1.5">
                {secondLine.join(" · ")}
                {hasMenu && (
                  <span className="inline-flex items-center gap-0.5 text-amber-400/80">
                    <Wine className="w-3 h-3" />
                    주대표
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
