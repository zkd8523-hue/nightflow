"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Club, MDHealthScore } from "@/types/database";
import { MDAlertBanner } from "./MDAlertBanner";
import { MDMonitorCard } from "./MDMonitorCard";

interface Props {
  mds: MDHealthScore[];
  clubsMap?: Record<string, Club[]>;
  defaultClubMap?: Record<string, string | null>;
}

type SortOption = "recent" | "wonAmount" | "health" | "joined";

export function MDMonitorList({ mds, clubsMap, defaultClubMap }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("recent");

  const filteredMDs = mds
    .filter(
      (md) =>
        md.name.toLowerCase().includes(search.toLowerCase()) ||
        (md.area && (Array.isArray(md.area) ? md.area.some(a => a.includes(search)) : md.area.includes(search))),
    )
    .sort((a, b) => {
      switch (sort) {
        case "recent":
          if (!a.last_auction_date) return 1;
          if (!b.last_auction_date) return -1;
          return (
            new Date(b.last_auction_date).getTime() -
            new Date(a.last_auction_date).getTime()
          );
        case "wonAmount":
          return b.total_won_amount - a.total_won_amount;
        case "health":
          return (b.health_score || 0) - (a.health_score || 0);
        case "joined":
          return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime();
        default:
          return 0;
      }
    });

  return (
    <div className="space-y-4">
      <MDAlertBanner
        mds={mds}
        onMDClick={(id) => router.push(`/admin/mds/${id}`)}
      />

      {/* Search & Sort */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 지역 검색..."
            className="pl-10 bg-card border-border text-foreground rounded-xl"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="px-4 py-2 bg-card text-foreground rounded-xl border border-border text-sm"
        >
          <option value="recent">최근활동순</option>
          <option value="wonAmount">낙찰액순</option>
          <option value="health">점수순</option>
          <option value="joined">최근가입순</option>
        </select>
      </div>

      {/* MD Cards */}
      <div className="space-y-2">
        {filteredMDs.length > 0 ? (
          filteredMDs.map((md) => (
            <MDMonitorCard
              key={md.md_id}
              md={md}
              clubs={clubsMap?.[md.md_id] ?? []}
              defaultClubId={defaultClubMap?.[md.md_id] ?? null}
            />
          ))
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            {search
              ? "검색 결과가 없습니다"
              : "활동 중인 파트너가 없습니다"}
          </div>
        )}
      </div>
    </div>
  );
}
