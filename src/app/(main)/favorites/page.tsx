"use client";

import { useMemo, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePuzzleFavoritesContext } from "@/components/providers";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Heart } from "lucide-react";
import { PuzzleCard } from "@/components/puzzles/PuzzleCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PuzzleInterest } from "@/types/database";

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

function PuzzleCardList({
  items,
  userRole,
  emptyText,
}: {
  items: PuzzleInterest[];
  userRole?: "user" | "md" | "admin";
  emptyText?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-neutral-500">
        {emptyText ?? "찜한 항목이 없어요."}
      </div>
    );
  }

  // 날짜별 그룹핑 (홈 참조)
  const groups = items.reduce((acc, fav) => {
    const p = fav.puzzle;
    if (!p) return acc;
    if (!acc[p.event_date]) acc[p.event_date] = [];
    acc[p.event_date].push(fav);
    return acc;
  }, {} as Record<string, PuzzleInterest[]>);

  return (
    <div className="space-y-12 pb-24">
      {Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, favs]) => {
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
              </div>
              <div className="space-y-4">
                {favs.map((fav) => {
                  const puzzle = fav.puzzle;
                  if (!puzzle) return null;
                  return (
                    <Link key={fav.id} href={`/flags/${puzzle.id}`} className="block">
                      <PuzzleCard puzzle={puzzle} userRole={userRole} hideNewBadge />
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function EmptyState({ isMdOrAdmin }: { isMdOrAdmin: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Heart className="w-12 h-12 text-neutral-700 mb-4" />
      <p className="text-[15px] text-neutral-400 font-bold mb-2">
        {isMdOrAdmin ? "아직 찜한 깃발/퍼즐이 없어요" : "아직 찜한 퍼즐이 없어요"}
      </p>
      <p className="text-[13px] text-neutral-600 mb-6">
        퍼즐 카드의 하트 버튼으로 찜해보세요.
      </p>
      <Link
        href="/?tab=puzzle"
        className="h-10 px-6 rounded-full bg-amber-500 text-black font-bold text-[14px] inline-flex items-center hover:bg-amber-400 transition-colors"
      >
        퍼즐 둘러보기
      </Link>
    </div>
  );
}

export default function FavoritesPage() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { favoritePuzzles, isLoading: puzzleFavLoading } = usePuzzleFavoritesContext();
  const router = useRouter();

  const isMdOrAdmin = user?.role === "md" || user?.role === "admin";
  const [puzzleSort, setPuzzleSort] = useState<"recent" | "budget">("recent");

  const sortFavorites = (list: PuzzleInterest[]) => {
    const sorted = [...list];
    if (isMdOrAdmin && puzzleSort === "budget") {
      sorted.sort((a, b) => {
        const ab = a.puzzle ? (a.puzzle.total_budget ?? a.puzzle.budget_per_person * a.puzzle.target_count) : 0;
        const bb = b.puzzle ? (b.puzzle.total_budget ?? b.puzzle.budget_per_person * b.puzzle.target_count) : 0;
        return bb - ab;
      });
    } else {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted;
  };

  // 깃발 = 깃발 직접 등록 + 인원 충족된 퍼즐 (오퍼 가능)
  const flagFavorites = useMemo(() => {
    const list = favoritePuzzles.filter((fav) => {
      const p = fav.puzzle;
      if (!p) return false;
      return !p.is_recruiting_party || p.current_count >= p.target_count;
    });
    return sortFavorites(list);
  }, [favoritePuzzles, isMdOrAdmin, puzzleSort]); // eslint-disable-line react-hooks/exhaustive-deps

  // 퍼즐 = 모집 중인 미완성 퍼즐 (트래킹용)
  const puzzleFavorites = useMemo(() => {
    const list = favoritePuzzles.filter((fav) => {
      const p = fav.puzzle;
      if (!p) return false;
      return p.is_recruiting_party && p.current_count < p.target_count;
    });
    return sortFavorites(list);
  }, [favoritePuzzles, isMdOrAdmin, puzzleSort]); // eslint-disable-line react-hooks/exhaustive-deps

  // 일반 유저: 전체 표시 (탭 없음)
  const allFavorites = useMemo(() => sortFavorites(favoritePuzzles), [favoritePuzzles, isMdOrAdmin, puzzleSort]); // eslint-disable-line react-hooks/exhaustive-deps

  if (userLoading || puzzleFavLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.push("/login?redirect=/favorites");
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </button>
          <h1 className="text-xl font-black text-white">찜</h1>
          {favoritePuzzles.length > 0 && (
            <span className="text-[13px] text-neutral-500">{favoritePuzzles.length}개</span>
          )}
        </div>

        {favoritePuzzles.length === 0 ? (
          <EmptyState isMdOrAdmin={isMdOrAdmin} />
        ) : isMdOrAdmin ? (
          <Tabs defaultValue="flag">
            <TabsList className="w-full bg-[#1C1C1E] rounded-xl mb-4 p-1">
              <TabsTrigger
                value="flag"
                className="flex-1 rounded-lg text-[14px] font-bold data-[state=active]:bg-amber-500 data-[state=active]:text-black text-neutral-500"
              >
                🚩 깃발
                {flagFavorites.length > 0 && (
                  <span className="ml-1.5 text-[11px] opacity-80">{flagFavorites.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="puzzle"
                className="flex-1 rounded-lg text-[14px] font-bold data-[state=active]:bg-green-500 data-[state=active]:text-black text-neutral-500"
              >
                🧩 퍼즐
                {puzzleFavorites.length > 0 && (
                  <span className="ml-1.5 text-[11px] opacity-80">{puzzleFavorites.length}</span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* MD 정렬 토글 (탭 공통) */}
            <div className="flex items-center justify-end gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => setPuzzleSort("recent")}
                className={`h-7 px-3 inline-flex items-center rounded-full text-[12px] leading-none font-bold transition-colors ${
                  puzzleSort === "recent"
                    ? "bg-white text-black"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                최신순
              </button>
              <button
                type="button"
                onClick={() => setPuzzleSort("budget")}
                className={`h-7 px-3 inline-flex items-center rounded-full text-[12px] leading-none font-bold transition-colors ${
                  puzzleSort === "budget"
                    ? "bg-white text-black"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                금액 높은순 ↑
              </button>
            </div>

            <TabsContent value="flag">
              <PuzzleCardList items={flagFavorites} userRole={user.role as "user" | "md" | "admin" | undefined} emptyText="찜한 깃발이 없어요. 인원 확정된 깃발 또는 완성된 퍼즐이 여기에 모여요." />
            </TabsContent>
            <TabsContent value="puzzle">
              <PuzzleCardList items={puzzleFavorites} userRole={user.role as "user" | "md" | "admin" | undefined} emptyText="찜한 퍼즐(모집 중)이 없어요. 완성되면 자동으로 깃발 탭으로 이동해요." />
            </TabsContent>
          </Tabs>
        ) : (
          <PuzzleCardList items={allFavorites} userRole={user.role as "user" | "md" | "admin" | undefined} />
        )}
      </div>
    </div>
  );
}
