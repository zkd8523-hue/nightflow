"use client";

import Link from "next/link";
import { useRef, useState, useEffect, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PuzzleCard } from "@/components/puzzles/PuzzleCard";
import { ClubDirectCard, groupPuzzlesByClub } from "@/components/puzzles/ClubDirectCard";
import { OfferSheet } from "@/components/puzzles/OfferSheet";
import { PuzzleJoinSheet } from "@/components/puzzles/PuzzleJoinSheet";
import { createClient } from "@/lib/supabase/client";
import { usePreferredClubMeta } from "@/hooks/usePreferredClubMeta";
import type { Puzzle } from "@/types/database";

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
  /** 비로그인 → /login?redirect, 로그인 → /flags/new (조각이면 /shares/new) */
  newFlagHref: string;
  /** 조각(파티원 모집) 모드 — 빈상태/CTA 문구를 조각으로 전환 */
  shareMode?: boolean;
  /** 마지막 카드 자리에 노출할 CTA. 없으면 "자세히 보기" 카드 노출. */
  showFlagCTA?: boolean;
  /**
   * 전체 깃발 개수. puzzles가 캐러셀용으로 이미 잘려서 들어올 때,
   * "더보기 ⋯" 버튼 노출 판단에 사용. 미지정 시 puzzles.length 사용.
   */
  totalCount?: number;
  /** 현재 지역 필터가 걸려있는지 — 0개일 때 "전체 보기" 안내로 분기 */
  isAreaFiltered?: boolean;
  /** 지역 필터 해제 콜백 (필터로 0개일 때 "전체 보기" 버튼용) */
  onClearAreaFilter?: () => void;
  /** 현재 화면 맨 앞 카드의 날짜 라벨("6월 23일 (화)")을 부모(섹션 헤더)에 올린다. */
  onActiveDateChange?: (label: string | null) => void;
}

const MAX_CARDS = 3;

export function HomePuzzleCarousel({
  puzzles,
  offerCounts,
  userRole,
  detailHref,
  newFlagHref,
  shareMode = false,
  showFlagCTA = false,
  totalCount,
  isAreaFiltered = false,
  onClearAreaFilter,
  onActiveDateChange,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 제안받고 싶은 클럽(Migration 504) 칩/배지 메타 — PuzzleList와 공용 훅
  const { preferredClubNames, myClubIds } = usePreferredClubMeta(puzzles, userRole);

  // 지역 필터를 바꾸면(목록 구성이 달라지면) 캐러셀을 맨 앞으로 되감는다.
  // 중간에 스크롤된 상태로 다른 지역 목록이 들어오면 첫 카드가 가려져 보이는 문제 방지.
  const listSignature = puzzles.map((p) => p.id).join(",");
  useEffect(() => {
    scrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [listSignature]);

  // 조각 모드: 파트너 직통은 클럽 묶음 카드 1장으로 맨 앞에, 그 뒤로 유저 조각.
  // 클럽당 최대 6등급 × D-7이면 조각 1건=카드 1장 구조로는 캐러셀이 감당이 안 된다(Migration 505).
  // 캐러셀은 카드 위에 날짜 헤더가 붙으므로 클럽×날짜로 묶는다 — 클럽 단위로 묶으면
  // "8월 5일" 밑에 그 주 전체가 들어가 개수가 어긋난다.
  const partnerGroups = useMemo(
    () =>
      shareMode
        ? groupPuzzlesByClub(puzzles.filter((p) => p.host_is_md), { byDate: true }).sort(
            (a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? "")
          )
        : [],
    [puzzles, shareMode]
  );
  const userPuzzles = useMemo(
    () => (shareMode ? puzzles.filter((p) => !p.host_is_md) : puzzles),
    [puzzles, shareMode]
  );
  const leadGroup = partnerGroups[0] ?? null;
  const visible = userPuzzles.slice(0, leadGroup ? MAX_CARDS - 1 : MAX_CARDS);

  // 현재 화면 맨 앞 카드의 날짜를 섹션 헤더로 올린다(스크롤 시 함께 변경).
  const headDates: string[] = [
    ...(leadGroup ? [leadGroup.eventDate ?? leadGroup.puzzles[0].event_date] : []),
    ...visible.map((p) => p.event_date),
  ];
  const headDateSignature = headDates.join(",");
  useEffect(() => {
    if (!onActiveDateChange) return;
    const el = scrollRef.current;
    const labelAt = (idx: number) =>
      headDates[idx] ? formatEventDateLabel(headDates[idx]) : null;
    onActiveDateChange(labelAt(0));
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const first = el.firstElementChild as HTMLElement | null;
        if (!first) return;
        const step = first.offsetWidth + 12; // 카드 너비 + gap(12px)
        const idx = Math.min(headDates.length - 1, Math.round(el.scrollLeft / step));
        onActiveDateChange(labelAt(Math.max(0, idx)));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headDateSignature, onActiveDateChange]);

  // MD 제안 시트 / 유저 합류 시트 — PuzzleList와 동일하게 캐러셀에서 바로 띄운다.
  const [unlockTarget, setUnlockTarget] = useState<Puzzle | null>(null);
  const [joinTarget, setJoinTarget] = useState<Puzzle | null>(null);
  // 본인 합류/제안 상태 — "합류 완료"/"제안 완료" 배지 정확도용 (PuzzleList와 동일)
  const [myPuzzleIds, setMyPuzzleIds] = useState<Set<string>>(new Set());
  const [myOfferedPuzzleIds, setMyOfferedPuzzleIds] = useState<Set<string>>(new Set());
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyUserId(user.id);

      const [{ data: members }, { data: offers }] = await Promise.all([
        supabase.from("puzzle_members").select("puzzle_id").eq("user_id", user.id),
        supabase.from("puzzle_offers").select("puzzle_id").eq("md_id", user.id).in("status", ["pending", "accepted"]),
      ]);

      if (members) setMyPuzzleIds(new Set(members.map((d) => d.puzzle_id)));
      if (offers) setMyOfferedPuzzleIds(new Set(offers.map((d) => d.puzzle_id)));
    })();
  }, []);

  if (puzzles.length === 0) {
    // 지역 필터 때문에 0개 → 깃발꽂기 유도 대신 "전체 보기"로 안내
    if (isAreaFiltered) {
      return (
        <div className="bg-card rounded-3xl border border-border p-6 text-center space-y-3 -mx-4">
          <p className="text-[15px] text-foreground font-bold">{shareMode ? "이 지역엔 아직 파티가 없어요" : "이 지역엔 아직 깃발이 없어요"}</p>
          <p className="text-[12px] text-muted-foreground">
            다른 지역을 선택하거나 전체에서 둘러보세요
          </p>
          {onClearAreaFilter && (
            <button
              type="button"
              onClick={onClearAreaFilter}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-muted text-foreground text-[13px] font-black active:scale-95 transition"
            >
              전체 보기
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="bg-card rounded-3xl border border-border p-6 text-center space-y-3 -mx-4">
        <div className="space-y-1">
          <p className="text-[15px] text-foreground font-bold">{shareMode ? "파티원과 함께 놀아요!" : "아직 등록된 깃발이 없어요"}</p>
          <p className="text-[12px] text-muted-foreground">
            {shareMode ? "파티가 모이면 클럽에서 테이블을 제안해요" : "예산·인원·날짜만 정하면 파트너들이 시크릿오퍼를 보내요"}
          </p>
        </div>
        {/* 파티 등록은 유저 전용 — MD/Admin에겐 CTA 숨김 */}
        {!(shareMode && (userRole === "md" || userRole === "admin")) && (
          <Link
            href={newFlagHref}
            className={`inline-flex items-center gap-1 px-4 py-2 rounded-full text-black text-[13px] font-black active:scale-95 transition ${shareMode ? "bg-green-500 hover:bg-green-400" : "bg-amber-500"}`}
          >
            {shareMode ? "🎉 파티 올리기" : "⛳ 깃발 꽂기"}
          </Link>
        )}
      </div>
    );
  }

  // MD/Admin은 깃발을 "꽂는" 주체가 아니라 오퍼를 넣는 쪽 → 깃발꽂기 CTA 숨기고
  // 끝 슬라이드를 "더보기 >" 카드로 대체 (유저/비로그인은 기존 CTA 유지).
  const isMd = userRole === "md" || userRole === "admin";

  return (
    <div>
      <div
        ref={scrollRef}
        data-no-pull-refresh
        className="flex items-start gap-3 overflow-x-auto scrollbar-hide snap-x snap-proximity touch-pan-x touch-pan-y -mt-3 pt-3 pb-1 -mx-2 px-2"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
      >
        {leadGroup && (
          <div className="flex-shrink-0 w-[88%] max-w-[420px] snap-start snap-always">
            <ClubDirectCard
              group={leadGroup}
              sheetPuzzles={puzzles.filter((p) => p.host_is_md && p.club_id === leadGroup.clubId)}
            />
          </div>
        )}
        {visible.map((puzzle) => {
          // 날짜는 섹션 헤더가 스크롤에 맞춰 표시 → 카드 위 날짜 헤더는 제거.
          return (
            <div
              key={puzzle.id}
              className="flex-shrink-0 w-[88%] max-w-[420px] snap-start snap-always flex flex-col gap-2"
            >
              <PuzzleCard
                puzzle={puzzle}
                userRole={userRole}
                offerCount={offerCounts[puzzle.id] ?? 0}
                isMember={myPuzzleIds.has(puzzle.id)}
                isLeader={!!myUserId && myUserId === puzzle.leader_id}
                hasOffered={myOfferedPuzzleIds.has(puzzle.id)}
                onUnlock={(p) => setUnlockTarget(p)}
                onJoin={(p) => setJoinTarget(p)}
                preferredClubNames={preferredClubNames}
                myClubIds={myClubIds}
              />
            </div>
          );
        })}
        {isMd ? (
          shareMode ? (
            /* MD 조각: 매출 유도 CTA (등록은 무료, 유저 입장 시 크레딧 과금) */
            <div className="flex-shrink-0 w-[80%] max-w-[360px] snap-start snap-always flex items-center justify-center">
              <div className="text-center w-full mt-8">
                <p className="text-[14.5px] text-foreground/90 font-semibold mb-0.5">
                  파티원을 모아 매출을 올려보세요!
                </p>
                <Link href="/md/auctions/new">
                  <Button className="h-12 pl-7 pr-9 text-black font-black text-[15px] rounded-full bg-green-500 hover:bg-green-400">
                    🎉 파티 올리기
                  </Button>
                </Link>
                <p className="text-[10px] text-foreground/80 mt-0.5">등록 무료</p>
              </div>
            </div>
          ) : (
          /* MD/Admin 깃발: 끝 슬라이드를 "더보기 >" 카드로. 깃발꽂기 CTA는 노출하지 않음. */
          <Link
            href={detailHref}
            className="flex-shrink-0 w-[64%] max-w-[280px] snap-start snap-always flex items-center justify-center group"
            aria-label="깃발 더보기"
          >
            <div className="text-center w-full mt-8">
              <div className="inline-flex items-center gap-1 text-[15px] font-black text-foreground/80 group-hover:text-foreground transition-colors">
                더보기
                <ChevronRight className="w-4 h-4" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{totalCount ?? puzzles.length}개 보러가기</p>
            </div>
          </Link>
          )
        ) : (
          <>
            {showFlagCTA && (
              <div className="flex-shrink-0 w-[80%] max-w-[360px] snap-start snap-always flex items-center justify-center">
                <div className="text-center w-full mt-8">
                  <p className="text-[14.5px] text-foreground/90 font-semibold mb-0.5">
                    {shareMode ? "파티원과 함께 놀아요!" : "최고의 테이블을 잡으세요."}
                  </p>
                  <Link href={newFlagHref}>
                    <Button className={`h-12 pl-7 pr-9 text-black font-black text-[15px] rounded-full ${shareMode ? "bg-green-500 hover:bg-green-400" : "bg-amber-500 hover:bg-amber-400"}`}>
                      {shareMode ? "🎉 파티 올리기" : "⛳ 깃발꽂기"}
                    </Button>
                  </Link>
                  <p className="text-[10px] text-foreground/80 mt-0.5">모든 서비스 무료</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* MD 제안 Sheet — 제출 성공 시 페이지 이동 없이 홈에 머물므로 배지 즉시 갱신 */}
      {unlockTarget && (
        <OfferSheet
          puzzle={unlockTarget}
          open={!!unlockTarget}
          onClose={() => setUnlockTarget(null)}
          onSubmitted={() =>
            setMyOfferedPuzzleIds((prev) => new Set(prev).add(unlockTarget.id))
          }
        />
      )}

      {/* 유저 합류 Sheet */}
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
