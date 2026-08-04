"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Puzzle } from "@/types/database";

const PuzzleJoinSheet = dynamic(
  () => import("@/components/puzzles/PuzzleJoinSheet").then((m) => m.PuzzleJoinSheet),
  { ssr: false }
);

interface Props {
  /** 오늘 이후, host_is_md=true, is_recruiting_party=true, status in (open,selecting) 조각들.
   *  클럽당 파트너 1명 전제(weekly_share_slots, Migration 514)라 leader가 전부 동일 MD다. */
  puzzles: Puzzle[];
  /** 시트처럼 이미 클럽명이 제목에 있는 곳에서는 "조각" 헤딩을 숨긴다 */
  hideTitle?: boolean;
}

function dowLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

export function ClubSharePuzzles({ puzzles, hideTitle = false }: Props) {
  const dates = useMemo(() => {
    const set = new Set(puzzles.map((p) => p.event_date));
    return Array.from(set).sort();
  }, [puzzles]);

  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const [joinTarget, setJoinTarget] = useState<Puzzle | null>(null);

  if (dates.length === 0) return null;

  const grades = puzzles
    .filter((p) => p.event_date === selectedDate)
    .sort((a, b) => a.budget_per_person - b.budget_per_person);

  const partnerName = puzzles[0]?.leader?.display_name || puzzles[0]?.leader?.name || null;
  const partnerId = puzzles[0]?.leader_id ?? null;
  const minPrice = Math.min(...puzzles.map((p) => p.budget_per_person));
  const maxPrice = Math.max(...puzzles.map((p) => p.budget_per_person));

  return (
    <div className={`px-4 ${hideTitle ? "pt-3 pb-5" : "py-5 border-t border-border"}`}>
      {!hideTitle && (
        <div className="flex items-baseline gap-2 mb-1">
          <h2 className="text-[16px] font-black text-foreground">조각</h2>
          <span className="text-[12px] text-muted-foreground font-semibold">
            인당 {(minPrice / 10000).toLocaleString()}만~{(maxPrice / 10000).toLocaleString()}만원
          </span>
        </div>
      )}
      {partnerName && (
        <p className="text-[11.5px] text-muted-foreground font-semibold mb-3">
          파트너{" "}
          {partnerId ? (
            <Link
              href={`/u/${partnerId}`}
              className="text-foreground font-bold underline underline-offset-2 hover:text-brand-amber transition-colors"
            >
              {partnerName}
            </Link>
          ) : (
            <span className="text-foreground font-bold">{partnerName}</span>
          )}{" "}
          운영
        </p>
      )}

      {dates.length > 1 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
          {dates.map((date) => (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDate(date)}
              className={`shrink-0 px-3 h-8 rounded-full text-[12.5px] font-bold whitespace-nowrap transition-colors ${
                date === selectedDate
                  ? "bg-amber-500 text-black"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {dowLabel(date)}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
        {grades.map((p) => {
          // 남은 자리 수는 노출하지 않는다 — "0/4명"이 비어 보여 오히려 참가를 막는다.
          // 정원(4인)만 보여주고, 다 차면 버튼만 "마감"으로 바꾼다.
          const full = p.current_count >= p.target_count;
          return (
            <div key={p.id} className={`bg-card px-4 py-3 ${full ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-black text-foreground truncate">
                    {p.notes || `${p.area} 조각`}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-semibold truncate">
                    {p.target_count}인
                    {p.includes && p.includes.length > 0 ? ` · ${p.includes.slice(0, 2).join("/")}` : ""} · 인당{" "}
                    <span className="text-brand-amber font-bold">{p.budget_per_person.toLocaleString()}원</span>
                  </p>
                </div>
                {full ? (
                  <span className="shrink-0 h-8 px-3.5 rounded-full bg-muted text-muted-foreground font-black text-[12px] flex items-center">
                    마감
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setJoinTarget(p)}
                    className="shrink-0 h-8 px-3.5 rounded-full bg-green-500 hover:bg-green-400 text-black font-black text-[12px] active:scale-95 transition-transform"
                  >
                    참가하기
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        참가하면 채팅방에 합류해요! 결제는 현장에서.
      </p>

      {joinTarget && (
        <PuzzleJoinSheet
          puzzle={joinTarget}
          open={!!joinTarget}
          onClose={() => setJoinTarget(null)}
        />
      )}
    </div>
  );
}
