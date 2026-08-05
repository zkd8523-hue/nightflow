"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { ChevronRight, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatNumber } from "@/lib/utils/format";
import type { Puzzle } from "@/types/database";

/** 채팅 안 조각 카드용 최소 필드 */
type PuzzleLite = Pick<
  Puzzle,
  | "id"
  | "area"
  | "event_date"
  | "status"
  | "target_count"
  | "current_count"
  | "total_budget"
  | "budget_per_person"
>;

// 같은 조각이 여러 메시지에 있어도 한 번만 조회 (와글은 한 화면에 글이 많다)
const cache = new Map<string, PuzzleLite | null>();

interface Props {
  puzzleId: string;
  /** 같이 보낸 한마디. 있으면 카드 안 상단에 함께 렌더 (말풍선과 분리되지 않게) */
  caption?: string | null;
}

/**
 * 와글에 공유된 조각 카드 (Migration 471).
 * 스냅샷이 아니라 실시간 조회 — 인원이 차오르거나 마감되면 카드도 같이 바뀐다.
 */
export function ChatSharedPuzzleCard({ puzzleId, caption }: Props) {
  const [puzzle, setPuzzle] = useState<PuzzleLite | null | undefined>(
    cache.get(puzzleId)
  );

  useEffect(() => {
    if (cache.has(puzzleId)) return;
    let cancelled = false;
    createClient()
      .from("puzzles")
      .select(
        "id, area, event_date, status, target_count, current_count, total_budget, budget_per_person"
      )
      .eq("id", puzzleId)
      .maybeSingle()
      .then(({ data }) => {
        const v = (data as PuzzleLite) ?? null;
        cache.set(puzzleId, v);
        if (!cancelled) setPuzzle(v);
      });
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  const captionEl = caption ? (
    <p className="text-[14px] leading-snug text-foreground whitespace-pre-wrap break-words px-3 pt-2.5">
      {caption}
    </p>
  ) : null;

  if (puzzle === undefined) {
    return (
      <div className="mt-1 rounded-2xl border border-border bg-card max-w-[260px] overflow-hidden">
        {captionEl}
        <div className="m-3 h-14 rounded-xl bg-muted/60 animate-pulse" />
      </div>
    );
  }
  if (puzzle === null) {
    return (
      <div className="mt-1 rounded-2xl border border-border bg-card max-w-[260px] overflow-hidden">
        {captionEl}
        <p className="px-3 py-2.5 text-[12px] text-muted-foreground">사라진 파티가에요</p>
      </div>
    );
  }

  const perPerson =
    puzzle.total_budget != null && puzzle.target_count > 0
      ? Math.round(puzzle.total_budget / puzzle.target_count)
      : puzzle.budget_per_person;
  const open = puzzle.status === "open" || puzzle.status === "selecting";
  const full = puzzle.current_count >= puzzle.target_count;

  return (
    <div className="mt-1 rounded-2xl border border-border bg-card max-w-[260px] overflow-hidden">
      {captionEl}
      <Link
        href={`/flags/${puzzle.id}`}
        onClick={(e) => e.stopPropagation()}
        className={`block px-3 py-2 hover:bg-white/5 transition-colors ${
          caption ? "mt-1 border-t border-border" : ""
        }`}
      >
      {/* 2줄 고정 — 채팅에서 높이를 적게 먹도록 */}
      <p className="text-[13px] font-black text-foreground truncate">
        🎉 {dayjs(puzzle.event_date).format("M/D")} · {puzzle.area}
      </p>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-black text-foreground shrink-0">
            N{formatNumber(perPerson)}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[12px] font-bold text-muted-foreground shrink-0">
            {puzzle.current_count}/{puzzle.target_count}
            <Users className="w-3 h-3" />
          </span>
        </span>
        <span
          className={`inline-flex items-center text-[11px] font-black shrink-0 ${
            open && !full ? "text-money" : "text-muted-foreground"
          }`}
        >
          {!open ? "모집 마감" : full ? "인원 다 참" : "자세히"}
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>
      </Link>
    </div>
  );
}
