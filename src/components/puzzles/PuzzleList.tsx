"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PuzzleCard } from "./PuzzleCard";
import { PuzzleJoinSheet } from "./PuzzleJoinSheet";
import { OfferSheet } from "./OfferSheet";
import type { Puzzle } from "@/types/database";

function getDDay(eventDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(eventDate);
  event.setHours(0, 0, 0, 0);
  const diff = Math.round((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "D-Day";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

interface PuzzleListProps {
  puzzles: Puzzle[];
  userRole?: "user" | "md" | "admin";
}

export function PuzzleList({ puzzles, userRole }: PuzzleListProps) {
  const [joinTarget, setJoinTarget] = useState<Puzzle | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<Puzzle | null>(null);

  return (
    <div className="relative">
      {puzzles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <div className="space-y-2 text-center">
            <p className="text-[15px] font-bold text-neutral-300">아직 등록된 퍼즐이 없어요</p>
            <p className="text-[12px] text-neutral-500 leading-relaxed">
              날짜·지역·예산을 올리면<br />맞는 MD가 먼저 연락해요
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-12 pb-24">
          {Object.entries(
            puzzles.reduce((groups, puzzle) => {
              const date = puzzle.event_date;
              if (!groups[date]) groups[date] = [];
              groups[date].push(puzzle);
              return groups;
            }, {} as Record<string, Puzzle[]>)
          )
            .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
            .map(([date, items]) => {
              const d = new Date(date + "T00:00:00");
              const m = d.getMonth() + 1;
              const day = d.getDate();
              const days = ["일", "월", "화", "수", "목", "금", "토"];
              const dateLabel = `${m}월 ${day}일 (${days[d.getDay()]})`;

              const dday = getDDay(date);

              return (
                <div key={date} className="space-y-4">
                  <div className="flex items-center gap-2.5 px-1 py-1">
                    <div className="w-1 h-[14px] bg-purple-500 rounded-full mt-[1px]" />
                    <h3 className="text-[16px] font-black text-white tracking-tight">{dateLabel}</h3>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full mt-[1px] ${
                        dday === "D-Day"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-neutral-800 text-neutral-400"
                      }`}
                    >
                      {dday}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {items.map((puzzle) => (
                      <Link key={puzzle.id} href={`/puzzles/${puzzle.id}`} className="block" onClick={(e) => e.stopPropagation()}>
                        <PuzzleCard
                          puzzle={puzzle}
                          userRole={userRole}
                          onJoin={(p) => {
                            setJoinTarget(p);
                          }}
                          onUnlock={(p) => {
                            setUnlockTarget(p);
                          }}
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Floating 퍼즐 만들기 버튼 (유저 전용) — 퍼즐 유무와 무관하게 항상 렌더 */}
      {userRole !== "md" && (
        <Link
          href="/puzzles/new"
          className="fixed bottom-24 right-4 flex items-center gap-2 bg-purple-500 hover:bg-purple-400 rounded-full pl-4 pr-3 py-3 shadow-lg z-40 transition-colors"
        >
          <span className="text-white text-sm font-semibold whitespace-nowrap">퍼즐만들기</span>
          <Plus className="w-5 h-5 text-white" />
        </Link>
      )}

      {/* 참여 Sheet */}
      {joinTarget && (
        <PuzzleJoinSheet
          puzzle={joinTarget}
          open={!!joinTarget}
          onClose={() => setJoinTarget(null)}
        />
      )}

      {/* MD 제안 Sheet */}
      {unlockTarget && (
        <OfferSheet
          puzzle={unlockTarget}
          open={!!unlockTarget}
          onClose={() => setUnlockTarget(null)}
        />
      )}
    </div>
  );
}
