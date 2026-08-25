"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { BadgeCheck, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import type { Puzzle } from "@/types/database";

// 자리 목록·참가 시트는 클럽 페이지의 조각 섹션을 그대로 쓴다 — 같은 화면을 두 벌 만들지 않는다.
const ClubSharePuzzles = dynamic(
  () => import("@/components/clubs/ClubSharePuzzles").then((m) => m.ClubSharePuzzles),
  { ssr: false }
);

/**
 * 클럽 다이렉트 카드 — 같은 클럽·같은 날 조각(등급)들을 한 장으로 묶는다.
 *
 * D-7 자동 발행(Migration 505) + 클럽당 최대 6등급이면 조각 1건 = 카드 1장 구조로는
 * 피드가 `MD수 × 등급수 × 일수`로 불어난다. 데이터는 그대로 두고 표시 계층에서만 묶는다.
 * 카드를 누르면 클럽 페이지의 조각 섹션(ClubSharePuzzles)으로 이동해 등급을 고른다.
 */

export interface ClubDirectGroup {
  clubId: string;
  clubName: string;
  area: string | null;
  thumbnailUrl: string | null;
  /** byDate로 묶었을 때만 채워진다 — 그 카드가 가리키는 날짜 */
  eventDate?: string;
  /** 이 묶음의 조각들 — 가격 오름차순 */
  puzzles: Puzzle[];
}

/**
 * host_is_md 조각들을 클럽 단위로 묶는다.
 *
 * byDate=true면 클럽×날짜로 묶는다. 날짜 헤더 아래에 놓이는 곳(홈 캐러셀)에서는
 * 필수다 — 클럽 단위로만 묶으면 "8월 5일" 헤더 밑에 그 주 전체 조각이 들어가
 * "＋9개 더"처럼 그날과 무관한 개수가 뜬다.
 * 날짜 헤더가 없는 목록(클럽 다이렉트 섹션)에서는 클럽 단위가 맞다.
 */
export function groupPuzzlesByClub(
  puzzles: Puzzle[],
  opts?: { byDate?: boolean }
): ClubDirectGroup[] {
  const map = new Map<string, ClubDirectGroup>();
  puzzles.forEach((p) => {
    if (!p.club_id) return;
    const key = opts?.byDate ? `${p.club_id}|${p.event_date}` : p.club_id;
    const existing = map.get(key);
    if (existing) {
      existing.puzzles.push(p);
      return;
    }
    map.set(key, {
      clubId: p.club_id,
      clubName: p.club?.name ?? p.area,
      area: p.club?.area ?? p.area,
      thumbnailUrl: p.club?.thumbnail_url ?? null,
      eventDate: opts?.byDate ? p.event_date : undefined,
      puzzles: [p],
    });
  });
  return Array.from(map.values()).map((g) => ({
    ...g,
    puzzles: [...g.puzzles].sort((a, b) => a.budget_per_person - b.budget_per_person),
  }));
}

export function ClubDirectCard({
  group,
  showBadge = true,
  sheetPuzzles,
}: {
  group: ClubDirectGroup;
  showBadge?: boolean;
  /** 시트에 보여줄 조각 — 카드가 날짜별로 쪼개져 있어도 시트에서는 그 클럽 전체 날짜를 고를 수 있게 */
  sheetPuzzles?: Puzzle[];
}) {
  const { clubName, area, thumbnailUrl, puzzles } = group;
  // 클럽당 파트너 1명 전제(weekly_share_slots)라 아무 조각의 방장이나 같은 사람이다
  const partnerName = puzzles[0]?.leader?.display_name || puzzles[0]?.leader?.name || null;
  const minPrice = Math.min(...puzzles.map((p) => p.budget_per_person));
  // 미리보기 2줄 — 최저가 순. 마감 임박(1자리 이하)은 빨갛게.
  const preview = puzzles.slice(0, 2);
  const restCount = puzzles.length - preview.length;
  const urgentCount = puzzles.filter((p) => {
    const left = p.target_count - p.current_count;
    return left > 0 && left <= 1;
  }).length;

  const [open, setOpen] = useState(false);
  // 본인이 올린 조각이면 "참가"가 아니라 관리가 필요하다 — 대시보드 조각 탭으로 보낸다.
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await createClient().auth.getUser();
      if (!cancelled) setIsOwner(!!data.user && data.user.id === puzzles[0]?.leader_id);
    })();
    return () => { cancelled = true; };
  }, [open, puzzles]);

  return (
    <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="block w-full text-left bg-card border border-border rounded-2xl p-3 relative active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-3">
        <div className="w-[76px] h-[76px] rounded-xl overflow-hidden shrink-0 bg-muted grid place-items-center">
          {thumbnailUrl ? (
            <Image src={thumbnailUrl} alt={clubName} width={76} height={76} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[20px] font-black text-muted-foreground">{clubName.slice(0, 2)}</span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[15.5px] font-black text-foreground truncate">{clubName}</span>
            {area && <span className="text-[11.5px] text-muted-foreground font-bold shrink-0">{area}</span>}
          </div>
          {/* 섹션 헤더가 이미 "클럽 다이렉트"인 목록에선 중복이라 숨긴다(showBadge=false).
              색은 기존 "파트너 직통" 배지와 같은 파랑 — 같은 개념에 새 색을 더하지 않는다. */}
          {/* 누가 운영하는 자리인지 — 파티는 파트너 개인을 보고 참가하는 성격이 크다 */}
          {partnerName && (
            <span className="text-[11px] text-muted-foreground font-bold truncate">by {partnerName}</span>
          )}
          {showBadge && (
            <span className="self-start inline-flex items-center gap-1 text-[10px] font-black bg-blue-500/15 text-blue-400 rounded-md px-1.5 py-[3px] leading-none">
              <BadgeCheck className="w-3 h-3" />클럽 다이렉트
            </span>
          )}
          <span className="text-[14px] font-black">
            <span className="text-[11px] text-muted-foreground font-bold">인당 </span>
            <span className="text-money">{minPrice.toLocaleString()}원</span>
            <span className="text-[11px] text-muted-foreground font-bold">부터</span>
          </span>
          {urgentCount > 0 && (
            <span className="self-start text-[9.5px] font-black bg-red-500 text-white rounded-md px-1.5 py-[2.5px] leading-none">
              마감임박 {urgentCount}
            </span>
          )}
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>

      {/* 파티 미리보기 — "인당 N원부터"가 추상적으로 남지 않게 실제 가격표를 보여준다 */}
      <div className="mt-2.5 pt-2 border-t border-border/60">
        {preview.map((p) => {
          // 이름과 정원을 한 덩어리로 — "가성비 6인"이 자리 하나를 가리키는 최소 단위다.
          // 열을 셋으로 쪼개면 눈이 좌우로 흩어진다.
          const full = p.current_count >= p.target_count;
          return (
            <div key={p.id} className="flex items-center gap-2 py-1.5 text-[12px] font-bold">
              <span className="text-foreground truncate">
                {p.notes || "자리"} <span className="text-muted-foreground">{p.target_count}인</span>
              </span>
              <span className={`ml-auto font-black tabular-nums shrink-0 ${full ? "text-muted-foreground/60" : "text-money"}`}>
                {full ? "마감" : `${Math.round(p.budget_per_person / 10000)}만`}
              </span>
            </div>
          );
        })}
        {restCount > 0 && (
          <p className="text-[11.5px] text-muted-foreground font-bold pt-1.5">＋ {restCount}개 더</p>
        )}
      </div>

      {/* CTA — 카드 전체가 눌리긴 하지만, 파티는 등급이 여러 개라 "고른다"는 다음 행동을
          명시해야 한다. 줄마다 참가 버튼을 달지 않는 이유는 어느 자리인지 확인 없이
          참가가 확정되면 되돌리기가 번거롭기 때문. */}
      <span className="mt-2 flex justify-end">
        <span className="h-8 px-3.5 rounded-full bg-green-500 text-black font-black text-[12px] flex items-center">
          더보기
        </span>
      </span>
    </button>

    {/* 자리 고르기 — 클럽 페이지로 넘기면 피드로 돌아오기가 번거롭다. 그 자리에서 열고 닫는다. */}
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="bg-background border-border rounded-t-3xl max-h-[88vh] overflow-y-auto p-0">
        <SheetHeader className="px-4 pt-5 pb-0 text-left">
          {/* 오퍼 카드의 클럽명 규격 그대로 (SecretOfferCard.tsx:112-130).
              지역은 클럽명 바로 옆에 둔다 — 오른쪽 끝으로 밀면 시트 닫기(X)
              아래에 붙어 무엇에 대한 라벨인지 안 읽힌다. 닫기 버튼과 겹치지
              않게 제목 줄 자체에도 오른쪽 여백(pr-8)을 준다. */}
          <SheetTitle className="flex items-baseline gap-2 pr-8">
            <Link
              href={`/clubs/${group.clubId}`}
              className="inline-flex items-baseline gap-0.5 text-[21px] font-black text-foreground hover:text-brand-amber transition-colors min-w-0"
            >
              <span className="truncate">{clubName}</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground self-center shrink-0" />
            </Link>
            {area && <span className="text-[12px] text-muted-foreground font-black shrink-0">{area}</span>}
          </SheetTitle>
        </SheetHeader>
        <ClubSharePuzzles puzzles={sheetPuzzles ?? puzzles} hideTitle />
        <div className="px-4 pb-6">
          <Link
            href={isOwner ? "/md/dashboard?tab=share" : `/clubs/${group.clubId}`}
            className="flex items-center justify-center gap-1 h-11 rounded-xl bg-muted text-muted-foreground text-[13px] font-black active:scale-95 transition-transform"
          >
            {isOwner ? "대시보드로 이동" : "클럽 정보 보기"} <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}

/** 목록 상단에 붙는 "클럽 다이렉트" 섹션 헤더 */
export function ClubDirectHeader() {
  return (
    <div className="flex items-center gap-2 px-1">
      <BadgeCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />
      <h3 className="text-[16px] font-black text-foreground tracking-tight whitespace-nowrap">클럽 다이렉트</h3>
    </div>
  );
}
