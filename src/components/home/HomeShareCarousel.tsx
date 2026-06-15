"use client";

import Link from "next/link";
import { useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { AuctionCard } from "@/components/auctions/AuctionCard";
import type { Auction } from "@/types/database";

const DAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

// "2026-06-13" → Date (정오 고정으로 타임존 밀림 방지)
function isoToLocalDate(iso: string): Date {
  return new Date(iso + "T12:00:00");
}


// 카드 위 날짜 헤더 — 깃발 캐러셀과 동일한 "6월 23일 (화)" 포맷
function formatCardDateLabel(iso: string): string {
  const d = isoToLocalDate(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS_KO[d.getDay()]})`;
}

// 조각의 노출 기준 날짜 ISO — share_date 우선.
// 자동생성 조각은 event_date가 익일로 한 칸 밀려있어(예: share_date 6/15 / event_date 6/16)
// event_date를 쓰면 날짜 그룹이 밀린다. 노출/그룹/필터는 share_date 기준으로 통일(더보기와 일치).
function shareDateOf(a: Auction): string {
  return (
    a.share_date ||
    a.event_date ||
    (a.share_deadline ?? "").slice(0, 10)
  );
}

// 이번 주 오늘부터 이번 주 일요일까지의 날짜 ISO 배열 반환 (KST 기준)
function getThisWeekDates(): { iso: string }[] {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayISO = kstNow.toISOString().slice(0, 10);
  const todayDow = kstNow.getUTCDay(); // 0=일~6=토

  // 이번 주 월요일부터 일요일까지 7일
  const daysFromMonday = todayDow === 0 ? 6 : todayDow - 1;
  const monday = new Date(kstNow);
  monday.setUTCDate(kstNow.getUTCDate() - daysFromMonday);

  const result: { iso: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    if (iso < todayISO) continue; // 지난 날짜 제외
    result.push({ iso });
  }
  return result;
}

interface Props {
  shares: Auction[];
  userBidMap?: Record<string, number>;
  userInterestedSet?: Set<string>;
  currentUserId?: string;
  detailHref: string;
  newFlagHref?: string;
  userRole?: "user" | "md" | "admin";
  isAreaFiltered?: boolean;
  onClearAreaFilter?: () => void;
  /** 현재 화면 맨 앞 카드의 날짜 라벨("6월 15일 (월)")을 부모(섹션 헤더)에 올린다. */
  onActiveDateChange?: (label: string | null) => void;
}

const MAX_CARDS = 3;

export function HomeShareCarousel({
  shares,
  userBidMap = {},
  userInterestedSet,
  currentUserId,
  detailHref,
  newFlagHref,
  userRole,
  isAreaFiltered,
  onClearAreaFilter,
  onActiveDateChange,
}: Props) {
  const weekDates = getThisWeekDates();

  // 날짜별 조각 수 — 헤더/상세와 동일하게 shareDateOf(event_date 우선) 기준
  const countByDate = new Map<string, number>();
  for (const a of shares) {
    const d = shareDateOf(a);
    if (d) countByDate.set(d, (countByDate.get(d) ?? 0) + 1);
  }

  // 홈에서는 날짜 필터 제거 — 항상 이번 주 전체 조각을 날짜순으로 노출.
  const availableIsoSet = new Set(
    weekDates.filter(({ iso }) => (countByDate.get(iso) ?? 0) > 0).map(({ iso }) => iso)
  );
  const filtered = shares
    .filter((a) => availableIsoSet.has(shareDateOf(a)))
    .sort((x, y) => shareDateOf(x).localeCompare(shareDateOf(y)));

  // 지역 필터/날짜 탭이 바뀌면 카드 캐러셀을 맨 앞으로 되감는다.
  const cardScrollRef = useRef<HTMLDivElement>(null);
  const listSignature = filtered.map((a) => a.id).join(",");
  useEffect(() => {
    cardScrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [listSignature]);

  // 현재 화면 맨 앞 카드의 날짜를 섹션 헤더로 올린다(스크롤 시 함께 변경).
  const headCards = filtered.slice(0, MAX_CARDS);
  const headDateSignature = headCards.map((a) => shareDateOf(a)).join(",");
  useEffect(() => {
    if (!onActiveDateChange) return;
    const el = cardScrollRef.current;
    // 초기값: 첫 카드 날짜
    const labelAt = (idx: number) =>
      headCards[idx] ? formatCardDateLabel(shareDateOf(headCards[idx])) : null;
    onActiveDateChange(labelAt(0));
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const first = el.firstElementChild as HTMLElement | null;
        if (!first) return;
        // 카드 너비 + gap(12px) 기준으로 현재 맨 앞 카드 인덱스 추정
        const step = first.offsetWidth + 12;
        const idx = Math.min(headCards.length - 1, Math.round(el.scrollLeft / step));
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

  if (shares.length === 0) {
    // 지역 필터로 비었을 땐 "이 지역엔 없음" + 필터 해제 유도
    if (isAreaFiltered) {
      return (
        <div className="bg-[#1C1C1E] rounded-3xl p-6 text-center -mx-4">
          <p className="text-[14px] text-neutral-400 font-bold">이 지역엔 조각이 없어요</p>
          {onClearAreaFilter && (
            <button
              type="button"
              onClick={onClearAreaFilter}
              className="mt-3 inline-flex items-center gap-1 px-4 py-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white text-[13px] font-bold transition"
            >
              전체 지역 보기
            </button>
          )}
        </div>
      );
    }
    const isMdOrAdmin = userRole === "md" || userRole === "admin";
    if (isMdOrAdmin) {
      return (
        <div className="bg-[#1C1C1E] rounded-3xl p-6 text-center space-y-3 -mx-4">
          <p className="text-[15px] text-white font-bold">지금은 다른 조각이 없어요</p>
          <Link
            href="/md/dashboard?section=share"
            className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-green-500 hover:bg-green-400 text-black text-[13px] font-black active:scale-95 transition"
          >
            🧩 조각 등록하기
          </Link>
        </div>
      );
    }
    return (
      <div className="bg-[#1C1C1E] rounded-3xl p-6 text-center -mx-4">
        <p className="text-[15px] text-white font-bold mb-3">아직 등록된 조각이 없어요</p>
        {newFlagHref && (
          <>
            <Link
              href={newFlagHref}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-amber-500 text-black text-[13px] font-black active:scale-95 transition"
            >
              ⛳ 내가 깃발 꽂기
            </Link>
            <p className="text-[11px] text-neutral-500 mt-1">
              MD들이 24시간 대기하고 있어요
            </p>
          </>
        )}
      </div>
    );
  }

  const visible = filtered.slice(0, MAX_CARDS);
  const hasMore = filtered.length > MAX_CARDS;

  return (
    <div className="space-y-3">
      {/* 조각 카드 (홈은 날짜 필터 없이 이번 주 전체) */}
      {filtered.length === 0 ? (
        <div className="bg-[#1C1C1E] rounded-3xl p-6 text-center -mx-4">
          <p className="text-[14px] text-neutral-400 font-bold">이번 주 조각이 없어요</p>
          <p className="text-[11px] text-neutral-600 mt-1">조금만 기다려주세요</p>
        </div>
      ) : (
        <div
          ref={cardScrollRef}
          data-no-pull-refresh
          className="flex items-stretch gap-3 overflow-x-auto scrollbar-hide snap-x snap-proximity touch-pan-x touch-pan-y pb-1 -mx-2 px-2"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
        >
          {visible.map((share) => {
            // 날짜는 섹션 헤더가 스크롤에 맞춰 표시 → 카드 위 날짜 헤더는 제거.
            return (
            <div
              key={share.id}
              className="flex-shrink-0 w-[88%] max-w-[420px] snap-start snap-always flex flex-col gap-2"
            >
              <AuctionCard
                auction={share}
                userBidAmount={userBidMap[share.id]}
                isUserInterested={userInterestedSet?.has(share.id)}
                currentUserId={currentUserId}
                hidePuzzle
              />
            </div>
            );
          })}
          {hasMore && (
            /* 깃발 캐러셀과 동일한 텍스트형 "더보기 >" 카드 */
            <Link
              href={detailHref}
              className="flex-shrink-0 w-[64%] max-w-[280px] snap-start snap-always flex items-center justify-center group"
              aria-label="조각 더보기"
            >
              <div className="text-center w-full mt-8">
                <div className="inline-flex items-center gap-1 text-[15px] font-black text-neutral-300 group-hover:text-white transition-colors">
                  더보기
                  <ChevronRight className="w-4 h-4" />
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">{filtered.length}개 보러가기</p>
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
