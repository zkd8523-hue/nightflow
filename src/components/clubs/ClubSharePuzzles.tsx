"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { normalizeProfileImage } from "@/lib/utils/image";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import type { Puzzle } from "@/types/database";

const ShareJoinGuideSheet = dynamic(
  () => import("@/components/puzzles/ShareJoinGuideSheet").then((m) => m.ShareJoinGuideSheet),
  { ssr: false }
);

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
  const [guideOpen, setGuideOpen] = useState(false);
  // 이미 합류한 파티는 "합류하기"가 아니라 "합류중"으로 보여준다 —
  // 합류 후 이 화면으로 돌아왔을 때 버튼이 그대로면 됐는지 알 수가 없다. (PuzzleCard isMember와 동일 패턴)
  const [myPuzzleIds, setMyPuzzleIds] = useState<Set<string>>(new Set());

  const loadMyMemberships = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMyPuzzleIds(new Set());
      return;
    }
    const { data } = await supabase
      .from("puzzle_members")
      .select("puzzle_id")
      .eq("user_id", user.id);
    if (data) setMyPuzzleIds(new Set(data.map((d) => d.puzzle_id)));
  }, []);

  useEffect(() => {
    loadMyMemberships();
  }, [loadMyMemberships]);

  if (dates.length === 0) return null;

  const grades = puzzles
    .filter((p) => p.event_date === selectedDate)
    .sort((a, b) => a.budget_per_person - b.budget_per_person);

  const partnerName = puzzles[0]?.leader?.display_name || puzzles[0]?.leader?.name || null;
  const partnerId = puzzles[0]?.leader_id ?? null;
  const partnerImage = normalizeProfileImage(puzzles[0]?.leader?.profile_image ?? null);
  const minPrice = Math.min(...puzzles.map((p) => p.budget_per_person));
  const maxPrice = Math.max(...puzzles.map((p) => p.budget_per_person));

  return (
    <div className={`px-4 ${hideTitle ? "pt-1 pb-5" : "py-5 border-t border-border"}`}>
      {/* 유저는 "파티"가 뭔지 모른 채 참가 버튼을 만난다 — 설명을 제목과 같은 행 우측에 둔다.
          제목이 없는 시트(hideTitle)에서는 버튼만 우측 정렬로 남긴다. */}
      <div className={`flex items-baseline gap-2 ${hideTitle ? "justify-end mb-2" : "mb-2"}`}>
        {!hideTitle && (
          <>
            <h2 className="text-[16px] font-black text-foreground">🎉 파티</h2>
            <span className="text-[12px] text-muted-foreground font-semibold">
              인당 {(minPrice / 10000).toLocaleString()}만~{(maxPrice / 10000).toLocaleString()}만원
            </span>
          </>
        )}
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="ml-auto shrink-0 text-[11px] text-muted-foreground hover:text-foreground font-bold inline-flex items-center gap-0.5"
        >
          <span className="text-[12px]">ⓘ</span>
          파티란?
        </button>
      </div>
      {guideOpen && <ShareJoinGuideSheet manualOpen onManualClose={() => setGuideOpen(false)} />}

      {partnerName && (
        <Link
          href={partnerId ? `/u/${partnerId}` : "#"}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity mb-3"
        >
          <div className="relative w-11 h-11 rounded-md overflow-hidden bg-muted shrink-0 ring-1 ring-amber-500/40">
            {partnerImage ? (
              <Image src={partnerImage} alt={partnerName} fill sizes="44px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-foreground/40 font-black text-lg">
                {partnerName.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-foreground font-black text-[15px] truncate leading-tight">{partnerName}</p>
          </div>
        </Link>
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
          const joined = myPuzzleIds.has(p.id);
          return (
            <div key={p.id} className={`bg-card px-4 py-3 ${full && !joined ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-black text-foreground truncate">
                    {p.notes || `${p.area} 파티`}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-semibold truncate">
                    {p.target_count}인
                    {p.includes && p.includes.length > 0 ? ` · ${p.includes.slice(0, 2).join("/")}` : ""} · 인당{" "}
                    <span className="text-brand-amber font-bold">{p.budget_per_person.toLocaleString()}원</span>
                  </p>
                </div>
                {joined ? (
                  // 합류 확인 + 단체채팅 재진입 동선 — 이게 없으면 "합류가 된 건가?"에서 멈춘다
                  <Link
                    href={`/party/${p.id}`}
                    className="shrink-0 h-8 px-3.5 rounded-full bg-green-500/15 border border-green-500/30 text-money font-black text-[12px] flex items-center active:scale-95 transition-transform"
                  >
                    합류중
                  </Link>
                ) : full ? (
                  <span className="shrink-0 h-8 px-3.5 rounded-full bg-muted text-muted-foreground font-black text-[12px] flex items-center">
                    마감
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setJoinTarget(p)}
                    className="shrink-0 h-8 px-3.5 rounded-full bg-green-500 hover:bg-green-400 text-black font-black text-[12px] active:scale-95 transition-transform"
                  >
                    합류하기
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        오늘 같이 갈 사람들과 채팅방에서 만나요. 결제는 현장에서.
      </p>

      {joinTarget && (
        <PuzzleJoinSheet
          puzzle={joinTarget}
          open={!!joinTarget}
          onClose={() => {
            setJoinTarget(null);
            // 합류 성공/실패 어느 쪽이든 최신 상태로 맞춘다 (성공 시 버튼 → "합류중")
            loadMyMemberships();
          }}
        />
      )}
    </div>
  );
}
