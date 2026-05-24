"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChevronRight } from "lucide-react";
import { PuzzleCard } from "@/components/puzzles/PuzzleCard";
import type { Puzzle } from "@/types/database";

interface Props {
  puzzles: Puzzle[];
  offerCounts: Record<string, number>;
  userRole?: "user" | "md" | "admin";
  detailHref: string;
  emptyHref: string;
}

const MAX_CARDS = 5;

export function HomePuzzleCarousel({
  puzzles,
  offerCounts,
  userRole,
  detailHref,
  emptyHref,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (puzzles.length === 0) {
    return (
      <div className="bg-[#1C1C1E] rounded-3xl p-6 text-center space-y-3">
        <p className="text-[15px] text-white font-bold">아직 등록된 깃발이 없어요</p>
        <p className="text-[12px] text-neutral-500">
          예산·인원·날짜만 정하면 MD들이 시크릿 오퍼를 보내요
        </p>
        <Link
          href={emptyHref}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-amber-500 text-black text-[13px] font-black active:scale-95 transition"
        >
          ⛳ 깃발 꽂기
        </Link>
      </div>
    );
  }

  const visible = puzzles.slice(0, MAX_CARDS);
  const hasMore = puzzles.length > visible.length || visible.length === MAX_CARDS;

  return (
    <div>
      <div
        ref={scrollRef}
        data-no-pull-refresh
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory touch-pan-x pb-1 -mx-4 px-4"
      >
        {visible.map((puzzle) => (
          <div
            key={puzzle.id}
            className="flex-shrink-0 w-[88%] max-w-[420px] snap-start snap-always"
          >
            <PuzzleCard
              puzzle={puzzle}
              userRole={userRole}
              offerCount={offerCounts[puzzle.id] ?? 0}
            />
          </div>
        ))}
        {hasMore && (
          <div className="flex-shrink-0 w-[60%] max-w-[280px] snap-start snap-always">
            <Link
              href={detailHref}
              className="flex flex-col items-center justify-center h-full min-h-[200px] rounded-3xl border-2 border-dashed border-neutral-700 hover:border-amber-500/50 text-neutral-400 hover:text-white transition-colors px-4 py-8 gap-2"
            >
              <ChevronRight className="w-7 h-7" />
              <span className="text-[13px] font-bold text-center">
                자세히 보기
                <br />
                <span className="text-[10px] text-neutral-600">{puzzles.length}개 전체</span>
              </span>
            </Link>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center mt-3">
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-neutral-900 text-neutral-300 hover:bg-neutral-800 text-[12px] font-bold"
        >
          전체 보기
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
