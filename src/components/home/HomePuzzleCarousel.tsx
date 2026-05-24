"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PuzzleCard } from "@/components/puzzles/PuzzleCard";
import type { Puzzle } from "@/types/database";

interface Props {
  puzzles: Puzzle[];
  offerCounts: Record<string, number>;
  userRole?: "user" | "md" | "admin";
  detailHref: string;
  /** 비로그인 → /login?redirect, 로그인 → /flags/new */
  newFlagHref: string;
  /** 마지막 카드 자리에 노출할 CTA. 없으면 "자세히 보기" 카드 노출. */
  showFlagCTA?: boolean;
}

const MAX_CARDS = 5;

export function HomePuzzleCarousel({
  puzzles,
  offerCounts,
  userRole,
  detailHref,
  newFlagHref,
  showFlagCTA = false,
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
          href={newFlagHref}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-amber-500 text-black text-[13px] font-black active:scale-95 transition"
        >
          ⛳ 깃발 꽂기
        </Link>
      </div>
    );
  }

  const visible = puzzles.slice(0, MAX_CARDS);

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
        {showFlagCTA && (
          <div className="flex-shrink-0 w-[80%] max-w-[360px] snap-start snap-always flex items-center justify-center">
            <div className="text-center w-full">
              <p className="text-[14.5px] text-neutral-200 font-semibold mb-3">
                어떤 오퍼가 올지 궁금하다면?
              </p>
              <Link href={newFlagHref}>
                <Button className="h-12 px-8 bg-amber-500 text-black font-black text-[15px] rounded-full hover:bg-amber-400">
                  ⛳ 나도 깃발꽂기
                </Button>
              </Link>
              <p className="text-[10px] text-neutral-600 mt-2">평생 무료 · 1분 가입</p>
            </div>
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
