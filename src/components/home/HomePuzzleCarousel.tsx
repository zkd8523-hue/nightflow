"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PuzzleCard } from "@/components/puzzles/PuzzleCard";
import type { Puzzle } from "@/types/database";
import { getDDayLabel } from "@/lib/utils/format";

function formatEventDateLabel(eventDate: string): string {
  const d = new Date(eventDate + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

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
      <div className="bg-[#1C1C1E] rounded-3xl p-6 text-center space-y-3 -mx-4">
        <p className="text-[15px] text-white font-bold">아직 등록된 깃발이 없어요</p>
        <p className="text-[12px] text-neutral-500">
          예산·인원·날짜만 정하면 MD들이 시크릿오퍼를 보내요
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
        className="flex items-stretch gap-3 overflow-x-auto scrollbar-hide snap-x snap-proximity touch-pan-x touch-pan-y pb-1 -mx-2 px-2"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
      >
        {visible.map((puzzle) => {
          const dday = getDDayLabel(puzzle.event_date);
          const isUrgent = dday === "오늘" || dday === "내일";
          const ddayMatch = dday.match(/^D-(\d+)$/);
          const showDday = isUrgent || (ddayMatch && parseInt(ddayMatch[1], 10) <= 3);
          return (
            <div
              key={puzzle.id}
              className="flex-shrink-0 w-[88%] max-w-[420px] snap-start snap-always flex flex-col gap-2"
            >
              <div className="flex items-center gap-1.5 px-1">
                <div className="w-1 h-[14px] bg-amber-500 rounded-full flex-shrink-0" />
                <h3 className="text-[18px] font-black text-white tracking-tight">
                  {formatEventDateLabel(puzzle.event_date)}
                </h3>
                {showDday && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-px rounded-full mt-px ${
                      isUrgent ? "bg-red-500/20 text-red-400" : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {dday}
                  </span>
                )}
              </div>
              <PuzzleCard
                puzzle={puzzle}
                userRole={userRole}
                offerCount={offerCounts[puzzle.id] ?? 0}
              />
            </div>
          );
        })}
        {showFlagCTA && (
          <div className="flex-shrink-0 w-[80%] max-w-[360px] snap-start snap-always flex items-center justify-center">
            <div className="text-center w-full">
              <p className="text-[14.5px] text-neutral-200 font-semibold mb-1">
                당신도 오퍼 받아볼 차례
              </p>
              <Link href={newFlagHref}>
                <Button className="h-12 px-8 bg-amber-500 text-black font-black text-[15px] rounded-full hover:bg-amber-400">
                  ⛳ 나도 깃발꽂기
                </Button>
              </Link>
              <p className="text-[10px] text-neutral-300 mt-0.5">마음에 안 들면? 그냥 패스하면 끝</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
