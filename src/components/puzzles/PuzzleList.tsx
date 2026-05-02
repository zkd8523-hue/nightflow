"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PuzzleCard } from "./PuzzleCard";
import { PuzzleJoinSheet } from "./PuzzleJoinSheet";
import { OfferSheet } from "./OfferSheet";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics/events";
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
  offerCounts?: Record<string, number>;
}

export function PuzzleList({ puzzles, userRole, offerCounts = {} }: PuzzleListProps) {
  const [joinTarget, setJoinTarget] = useState<Puzzle | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<Puzzle | null>(null);
  const [myPuzzleIds, setMyPuzzleIds] = useState<Set<string>>(new Set());
  const [myOfferedPuzzleIds, setMyOfferedPuzzleIds] = useState<Set<string>>(new Set());
  const [toggleOn, setToggleOn] = useState(false);
  const isMd = userRole === "md" || userRole === "admin";

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: members }, { data: offers }] = await Promise.all([
        supabase.from("puzzle_members").select("puzzle_id").eq("user_id", user.id),
        supabase.from("puzzle_offers").select("puzzle_id").eq("md_id", user.id).in("status", ["pending", "accepted"]),
      ]);

      if (members) setMyPuzzleIds(new Set(members.map(d => d.puzzle_id)));
      if (offers) setMyOfferedPuzzleIds(new Set(offers.map(d => d.puzzle_id)));
    })();
  }, []);

  // 유저: 토글 ON 시 파티 모집 깃발만 필터
  // MD: 필터 없음 (정렬은 그룹별로 적용)
  const filteredPuzzles = !isMd && toggleOn
    ? puzzles.filter(p => p.is_recruiting_party && p.current_count < p.target_count)
    : puzzles;

  const getBudget = (p: Puzzle) =>
    p.total_budget ?? p.budget_per_person * p.target_count;

  const toggleButton = (
    <button
      onClick={() => setToggleOn((v) => !v)}
      className={`px-3 py-1 rounded-full text-[12px] font-bold transition-colors flex-shrink-0 ${
        toggleOn
          ? "bg-white text-black"
          : "bg-neutral-800 text-neutral-400"
      }`}
    >
      {isMd ? "예산순" : "파티"}
    </button>
  );

  return (
    <div className="relative">

      {filteredPuzzles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <div className="absolute top-0 right-0">{toggleButton}</div>
          <div className="space-y-2 text-center">
            <p className="text-[15px] font-bold text-neutral-300">
              {!isMd && toggleOn ? "모집 중인 깃발이 없어요" : "아직 꽂혀 있는 깃발이 없어요"}
            </p>
            <p className="text-[12px] text-neutral-500 leading-relaxed">
              {!isMd && toggleOn
                ? "파티원을 모집 중인 깃발이 아직 없어요"
                : "깃발을 꽂으면 MD가 몰려와\n클럽·테이블 조건을 제안해요"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-12 pb-24">
          {Object.entries(
            filteredPuzzles.reduce((groups, puzzle) => {
              const date = puzzle.event_date;
              if (!groups[date]) groups[date] = [];
              groups[date].push(puzzle);
              return groups;
            }, {} as Record<string, Puzzle[]>)
          )
            .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
            .map(([date, rawItems], groupIdx) => {
              const items = isMd && toggleOn
                ? [...rawItems].sort((a, b) => getBudget(b) - getBudget(a))
                : rawItems;
              const d = new Date(date + "T00:00:00");
              const m = d.getMonth() + 1;
              const day = d.getDate();
              const days = ["일", "월", "화", "수", "목", "금", "토"];
              const dateLabel = `${m}월 ${day}일 (${days[d.getDay()]})`;

              const dday = getDDay(date);

              return (
                <div key={date} className="space-y-4">
                  <div className="flex items-center gap-2.5 px-1 py-1">
                    <div className="w-1 h-[14px] bg-amber-500 rounded-full mt-[1px]" />
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
                    {groupIdx === 0 && <div className="flex-1 flex justify-end">{toggleButton}</div>}
                  </div>
                  <div className="space-y-4">
                    {items.map((puzzle) => (
                      <Link key={puzzle.id} href={`/flags/${puzzle.id}`} className="block" onClick={(e) => { e.stopPropagation(); trackEvent('puzzle_card_click', { puzzle_id: puzzle.id, area: puzzle.area, is_recruiting: puzzle.is_recruiting_party }); }}>
                        <PuzzleCard
                          puzzle={puzzle}
                          userRole={userRole}
                          offerCount={offerCounts[puzzle.id] || 0}
                          isMember={myPuzzleIds.has(puzzle.id)}
                          hasOffered={myOfferedPuzzleIds.has(puzzle.id)}
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

      {/* Floating CTA 버튼 (MD 제외) — 비로그인은 베네핏 호명, 로그인은 행동 호명 */}
      {userRole !== "md" && (
        <Link
          href={userRole ? "/flags/new" : "/login?redirect=/flags/new"}
          className="fixed bottom-24 right-4 flex items-center gap-2 bg-white hover:bg-neutral-200 text-black rounded-full pl-4 pr-3 py-3 shadow-lg z-40 transition-colors border-2 border-black"
        >
          <span className="text-black text-sm font-semibold whitespace-nowrap">
            {userRole ? "깃발 꽂기" : "나도 MD 제안 받기"}
          </span>
          <Plus className="w-5 h-5 text-black" />
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
