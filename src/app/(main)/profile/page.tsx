"use client";

import { useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  ShieldAlert,
  Clock,
  ChevronRight,
} from "lucide-react";
import { PuzzleCard } from "@/components/puzzles/PuzzleCard";
import { MyProfileSection } from "@/components/profile/MyProfileSection";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import dayjs from "dayjs";
import { getDDayLabel } from "@/lib/utils/format";
import type { Puzzle } from "@/types/database";

const FLAG_STATUS: Record<string, { text: string; tone: string }> = {
  open: { text: "제안 받는중", tone: "text-brand-amber" },
  selecting: { text: "제안 검토중", tone: "text-brand-amber" },
  matched: { text: "매칭 완료", tone: "text-money" },
  accepted: { text: "매칭 완료", tone: "text-money" },
  cancelled: { text: "취소됨", tone: "text-muted-foreground" },
  expired: { text: "만료됨", tone: "text-muted-foreground" },
};

export default function ProfilePage() {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();
  const supabase = createClient();

  // 닉네임/사진 편집은 /me (공개 프로필) ProfileEditSheet에서 처리
  // MD 파트너 연락처(인스타/카카오)는 자주 안 바꾸는 값이라 설정으로 이동 → PartnerContactSettings

  const [myFlags, setMyFlags] = useState<Puzzle[]>([]);
  // 진행중 깃발별 pending 오퍼 수 — 홈 카드와 동일한 배지 표시용
  // (깃발="오퍼 N개 중에서 고르는중", 파티="파트너 N명이 메시지를 남겼어요")
  const [flagOfferCounts, setFlagOfferCounts] = useState<Record<string, number>>({});
  // 깃발별 "마지막으로 확인한 오퍼 수"(localStorage) — 상세를 열면 갱신됨. NEW +N 계산 기준.
  const [flagOffersSeen, setFlagOffersSeen] = useState<Record<string, number>>({});
  // 합류(참여)한 조각 — 내가 만든 게 아니라 puzzle_members로 들어간 조각
  const [joinedShares, setJoinedShares] = useState<Puzzle[]>([]);
  // 깃발/조각 탭 → 깃발 탭 제거로 파티만 노출 (myTab state 삭제)

  useEffect(() => {
    if (!user) return;
    // 내가 만든 깃발/조각
    supabase
      .from("puzzles")
      .select("*")
      .eq("leader_id", user.id)
      .is("leader_hidden_at", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        setMyFlags(data as Puzzle[]);

        // 진행중(open/selecting) 깃발·조각의 pending 오퍼 수 집계 (홈과 동일 방식)
        // 조각도 오퍼를 받으므로 제외하지 않는다 (제외 시 조각 카드에 오퍼 배지가 안 뜸)
        const activeIds = (data as Puzzle[])
          .filter((f) => f.status === "open" || f.status === "selecting")
          .map((f) => f.id);
        if (activeIds.length === 0) return;
        supabase
          .from("puzzle_offers")
          .select("puzzle_id")
          .in("puzzle_id", activeIds)
          .eq("status", "pending")
          .then(({ data: offers }) => {
            if (!offers) return;
            const counts: Record<string, number> = {};
            offers.forEach((o) => {
              counts[o.puzzle_id] = (counts[o.puzzle_id] ?? 0) + 1;
            });
            setFlagOfferCounts(counts);

            // 각 깃발의 "확인한 오퍼 수"를 localStorage에서 읽어옴
            const seen: Record<string, number> = {};
            activeIds.forEach((id) => {
              const v = typeof window !== "undefined" ? localStorage.getItem(`flag_offers_seen_${id}`) : null;
              seen[id] = v ? parseInt(v, 10) || 0 : 0;
            });
            setFlagOffersSeen(seen);
          });
      });

    // 내가 합류한 조각 (방장 제외 — 내가 만든 건 위에서 이미 조회)
    (async () => {
      const { data: memberRows } = await supabase
        .from("puzzle_members")
        .select("puzzle_id")
        .eq("user_id", user.id);
      const joinedIds = (memberRows ?? []).map((r) => r.puzzle_id);
      if (joinedIds.length === 0) {
        setJoinedShares([]);
        return;
      }
      const { data: joined } = await supabase
        .from("puzzles")
        .select("*")
        .in("id", joinedIds)
        .eq("is_recruiting_party", true)
        .neq("leader_id", user.id)
        .order("created_at", { ascending: false });
      setJoinedShares((joined ?? []) as Puzzle[]);
    })();
  }, [user]);

  const handleHideFlag = async (id: string) => {
    if (typeof window !== "undefined" &&
        !window.confirm("삭제하면 복구할 수 없습니다.\n이 깃발을 목록에서 삭제할까요?")) return;
    const { data, error } = await supabase.rpc("hide_my_puzzle", { p_puzzle_id: id });
    if (error || !data?.success) {
      toast.error(data?.error || "삭제에 실패했습니다");
      return;
    }
    setMyFlags((prev) => prev.filter((f) => f.id !== id));
  };

  // 취소/만료된 항목 한번에 정리 (진행중/매칭완료는 대상 아님)
  const handleBulkCleanup = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (typeof window !== "undefined" &&
        !window.confirm(`취소·만료된 ${ids.length}개를 삭제할까요?\n삭제하면 복구할 수 없습니다.`)) return;
    const results = await Promise.all(
      ids.map((id) => supabase.rpc("hide_my_puzzle", { p_puzzle_id: id }))
    );
    const succeededIds = ids.filter((_, i) => !results[i].error && results[i].data?.success);
    const failedCount = ids.length - succeededIds.length;
    if (succeededIds.length > 0) {
      setMyFlags((prev) => prev.filter((f) => !succeededIds.includes(f.id)));
    }
    if (failedCount > 0) toast.error(`${failedCount}개는 삭제하지 못했습니다`);
    if (succeededIds.length > 0) toast.success(`${succeededIds.length}개 정리했습니다`);
  };

  // 깃발 탭 제거 — 파티(조각)만 노출. flagsOnly/cleanableFlagIds/탭 자동선택 로직 삭제.
  const sharesOnly = myFlags.filter((f) => f.is_recruiting_party);
  // 진행중(open/selecting) 판별 — 카드에 오퍼 현황/상태 뱃지 분기용
  const isActiveStatus = (s: string) => s === "open" || s === "selecting";
  // 취소/만료된 항목만 정리 대상 (매칭완료는 기록 보존을 위해 제외)
  const isCleanable = (s: string) => s === "cancelled" || s === "expired";
  const cleanableShareIds = sharesOnly.filter((f) => isCleanable(f.status)).map((f) => f.id);

  // 내 조각(내가 만든 것 + 합류한 것) 통합
  const allShares = [
    ...sharesOnly.map((flag) => ({ flag, joined: false })),
    ...joinedShares.map((flag) => ({ flag, joined: true })),
  ];

  // 로딩 타임아웃: 5초 후 강제 해제
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, [isLoading]);

  if (isLoading && !timedOut) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.push("/login?redirect=/profile");
    return null;
  }

  const isBanned = user.blocked_until && new Date(user.blocked_until) > new Date();
  const isBlocked = user.is_blocked;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-black text-foreground">MY</h1>
        </div>

        {/* 내 공개 프로필 — /u/[id]와 동일한 화면을 그대로 렌더 */}
        <div className="-mx-4 mb-4">
          <MyProfileSection userId={user.id} />
        </div>

        {/* 제재 상태 배너 */}
        {(isBlocked || isBanned) && (
          <div className={`rounded-2xl p-4 mb-4 ${isBlocked ? "bg-red-500/10 border border-red-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className={`w-4 h-4 ${isBlocked ? "text-red-400" : "text-brand-amber"}`} />
              <span className={`text-[13px] font-bold ${isBlocked ? "text-red-400" : "text-brand-amber"}`}>
                {isBlocked ? "계정이 영구 정지되었습니다" : "이용이 일시 정지되었습니다"}
              </span>
            </div>
            {isBanned && !isBlocked && (
              <p className="text-[12px] text-muted-foreground ml-6">
                정지 해제: {dayjs(user.blocked_until).format("YYYY년 M월 D일 HH:mm")}
              </p>
            )}
          </div>
        )}

        {/* 내 깃발 + 찜 목록 — 일반 유저 전용 (MD/admin은 숨김) */}
        {user.role !== "md" && user.role !== "admin" && (
        <>

        {/* 내 깃발/파티 — MD 대시보드 '내 오퍼'와 동일한 탭 구조.
            카드는 홈과 동일하게 페이지 배경 위에 올림(패널 없음) */}
        <div className="mb-6">
          {/* ⛳ 깃발 탭 제거 — 파티 목록만 노출 (탭 UI 없음) */}
          <Tabs value="share" className="w-full">
            <TabsContent value="share" className="m-0">
          {cleanableShareIds.length > 0 && (
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => handleBulkCleanup(cleanableShareIds)}
                className="text-[12px] font-bold text-muted-foreground hover:text-foreground/80 transition-colors"
              >
                취소·만료 {cleanableShareIds.length}개 정리
              </button>
            </div>
          )}
          {allShares.length > 0 ? (
            <div className="flex flex-col gap-3">
              {/* 모든 내 파티 — 홈과 동일한 카드. 종료는 상태 뱃지, 내가 만든 종료 파티만 삭제 */}
              {allShares.map(({ flag, joined }, i) => {
                const active = isActiveStatus(flag.status);
                const st = FLAG_STATUS[flag.status] ?? { text: flag.status, tone: "text-muted-foreground" };
                // 조각도 오퍼를 받으므로 깃발과 동일하게 오퍼 수·NEW 배지 노출
                const offers = active ? (flagOfferCounts[flag.id] ?? 0) : 0;
                const newOffers = Math.max(0, offers - (flagOffersSeen[flag.id] ?? 0));
                // 날짜가 바뀌는 첫 카드 위에만 날짜 헤더 (깃발 목록과 동일 스타일)
                const showDateHeader = i === 0 || allShares[i - 1].flag.event_date !== flag.event_date;
                return (
                  <div key={flag.id} className={`relative ${active ? "" : "opacity-70"}`}>
                    {showDateHeader && flag.event_date && (() => {
                      const d = new Date(flag.event_date + "T00:00:00");
                      const days = ["일","월","화","수","목","금","토"];
                      const dday = getDDayLabel(flag.event_date);
                      return (
                        <div className="flex items-center gap-2.5 px-1 pt-1 pb-0 mb-1.5">
                          <div className="w-1 h-[14px] bg-amber-500 rounded-full mt-[1px] flex-shrink-0" />
                          <h3 className="text-[16px] font-black text-foreground tracking-tight whitespace-nowrap">
                            {`${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`}
                          </h3>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full mt-[1px] whitespace-nowrap flex-shrink-0 ${dday === "오늘" ? "bg-amber-500/20 text-brand-amber" : "bg-muted text-muted-foreground"}`}>{dday}</span>
                        </div>
                      );
                    })()}
                    {newOffers > 0 && (
                      <span className="pointer-events-none absolute -top-2 -right-1.5 z-10 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black leading-none tracking-tight shadow-md shadow-rose-900/40">
                        NEW +{newOffers}
                      </span>
                    )}
                    <PuzzleCard
                      puzzle={flag}
                      userRole="user"
                      isLeader={!joined}
                      isMember={joined}
                      offerCount={offers}
                      hideNewBadge
                      myFlagStatus={active ? undefined : st}
                      onEdit={!joined && active ? () => router.push(`/flags/${flag.id}/edit`) : undefined}
                      onHide={joined ? undefined : () => handleHideFlag(flag.id)}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-[13px] text-muted-foreground">아직 올린 파티가 없어요</p>
            </div>
          )}
            </TabsContent>
          </Tabs>

          {/* 제재 정보 — 깃발/파티 공통이라 탭 밖에 둔다 */}
          {((user.warning_count || 0) > 0 || (user.strike_count || 0) > 0) && (
            <Link
              href="/my-penalties"
              className="flex items-center justify-between gap-2 mt-3 p-2.5 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-brand-amber shrink-0" />
                <p className="text-[12px] text-muted-foreground">
                  경고 <span className="text-brand-amber font-bold">{user.warning_count || 0}</span>/3
                  {(user.strike_count || 0) > 0 && (
                    <span className="ml-2">
                      스트라이크 <span className="text-red-400 font-bold">{user.strike_count}</span>
                    </span>
                  )}
                </p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </Link>
          )}

          {isBanned && !isBlocked && (
            <div className="flex items-center gap-2 mt-2 p-2.5 bg-amber-500/5 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-brand-amber shrink-0" />
              <p className="text-[12px] text-brand-amber">
                정지 해제: {dayjs(user.blocked_until).format("YYYY.MM.DD HH:mm")}
              </p>
            </div>
          )}
        </div>

        </>
        )}
      </div>
    </div>
  );
}
