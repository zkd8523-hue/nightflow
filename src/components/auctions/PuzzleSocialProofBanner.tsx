"use client";

import { usePuzzleSocialProof } from "@/hooks/usePuzzleSocialProof";

const MIN_PUZZLES = 5;
const MIN_OFFERS = 10;

export function PuzzleSocialProofBanner() {
  const { stats, isLoading } = usePuzzleSocialProof();

  if (isLoading || !stats) return null;
  if (stats.puzzleCount < MIN_PUZZLES || stats.offerCount < MIN_OFFERS) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500/30 via-orange-500/15 to-amber-500/5 border border-amber-500/40 rounded-xl mt-3 mb-4">
      <span className="text-sm leading-none flex-shrink-0">🔥</span>
      <p className="text-[11.5px] text-neutral-100 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
        지난 2주 동안 깃발{" "}
        <span className="text-amber-400 font-bold">{stats.puzzleCount}개</span>
        , 오퍼{" "}
        <span className="text-amber-400 font-bold">{stats.offerCount}개</span>
        가 꽂혔어요
      </p>
    </div>
  );
}
