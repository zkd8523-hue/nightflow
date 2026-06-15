"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import dayjs from "dayjs";
import { MDAuctionCard } from "@/components/md/MDAuctionCard";
import type { Auction } from "@/types/database";

interface Props {
    auctions: Auction[];
    onDelete: (id: string) => void;
    clubFavCounts: Record<string, number>;
}

const DOWS = ["일", "월", "화", "수", "목", "금", "토"];

// 그룹 키: 행사 날짜(event_date) 기준. 없으면 share_date 폴백.
function dateKey(a: Auction): string {
    return (a.event_date ?? a.share_date ?? "").slice(0, 10);
}

export function ShareAuctionGroups({ auctions, onDelete, clubFavCounts }: Props) {
    // 날짜별 그룹핑 + 날짜 오름차순(가까운 날 먼저)
    const groups = useMemo(() => {
        const map = new Map<string, Auction[]>();
        for (const a of auctions) {
            const k = dateKey(a);
            if (!map.has(k)) map.set(k, []);
            map.get(k)!.push(a);
        }
        return Array.from(map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, items]) => ({ key, items }));
    }, [auctions]);

    // 기본 펼침: 가장 가까운 날짜(첫 그룹)만. 나머지는 접힘.
    const [openKeys, setOpenKeys] = useState<Set<string>>(() => {
        const first = groups[0]?.key;
        return new Set(first ? [first] : []);
    });

    const toggle = (key: string) => {
        setOpenKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    return (
        <div className="space-y-2">
            {groups.map(({ key, items }) => {
                const open = openKeys.has(key);
                const d = key ? dayjs(key) : null;
                const label = d ? `${d.month() + 1}/${d.date()}(${DOWS[d.day()]})` : "날짜 미정";
                return (
                    <div key={key} className="rounded-xl overflow-hidden border border-neutral-800/60">
                        <button
                            type="button"
                            onClick={() => toggle(key)}
                            className="w-full flex items-center justify-between px-3 py-2.5 bg-neutral-900/60 hover:bg-neutral-900 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <span className="text-[13px] font-black text-white">{label}</span>
                                <span className="text-[11px] text-neutral-500 font-bold">{items.length}개</span>
                            </span>
                            <ChevronDown
                                className={`w-4 h-4 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
                            />
                        </button>
                        {open && (
                            <div className="p-2 space-y-2 bg-neutral-950/30">
                                {items.map((auction) => (
                                    <MDAuctionCard
                                        key={auction.id}
                                        auction={auction}
                                        onDelete={() => onDelete(auction.id)}
                                        favoriteCount={clubFavCounts[auction.club_id || ""] || 0}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
