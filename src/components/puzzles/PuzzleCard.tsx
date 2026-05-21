"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Puzzle, GenderPref, AgePref, VibePref, MusicPref } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";
import { TrustBadge } from "@/components/ui/TrustBadge";
import { getDealTier } from "@/lib/utils/dealTier";
import { formatRelativeTime } from "@/lib/utils/format";
import { usePuzzleFavoritesContext } from "@/components/providers";

interface PuzzleCardProps {
  puzzle: Puzzle;
  userRole?: "user" | "md" | "admin";
  offerCount?: number;
  isMember?: boolean;
  hasOffered?: boolean;
  hideNewBadge?: boolean;
  onJoin?: (puzzle: Puzzle) => void;
  onUnlock?: (puzzle: Puzzle) => void;
}

const GENDER_LABEL: Record<GenderPref, string | null> = {
  male_only: "남",
  female_only: "녀",
  any: null,
};

const AGE_LABEL: Record<AgePref, string | null> = {
  early_20s: "20초",
  late_20s: "20후",
  "30s": "30대",
  early_30s: "30초",
  mid_30s: "30중",
  any: null,
};

// Phase 1: 바이브 라벨 정정 (PuzzleForm과 동기화)
const VIBE_LABEL: Record<VibePref, string | null> = {
  chill: "편하게",
  active: "신나게",
  any: null,
};

const MUSIC_LABEL: Record<MusicPref, string | null> = {
  hiphop: "힙합",
  edm: "EDM",
  any: null,
};


export function PuzzlePiece({
  filled,
  isLeader,
  small,
  gender,
}: {
  filled: boolean;
  isLeader?: boolean;
  small?: boolean;
  /** Migration 184: 슬롯 성별. 'female'은 분홍, 그 외는 초록 */
  gender?: 'male' | 'female' | null;
}) {
  const size = small ? "w-8 h-8" : "w-10 h-10";
  const iconSize = small ? "w-4 h-4" : "w-5 h-5";
  const isFemale = gender === 'female';
  const isNeutral = gender == null;

  const filledClass = isFemale
    ? isLeader
      ? "bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.4)]"
      : "bg-pink-500/80"
    : isNeutral
      ? isLeader
        ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"
        : "bg-green-500/80"
      : isLeader
        ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]"
        : "bg-blue-500/80";

  const emptyClass = isFemale
    ? "bg-neutral-800/50 border border-dashed border-pink-500/40"
    : gender === 'male'
      ? "bg-neutral-800/50 border border-dashed border-blue-500/40"
      : isNeutral
        ? "bg-neutral-800/50 border border-dashed border-neutral-600"
        : "bg-neutral-800/50 border border-dashed border-neutral-600";

  return (
    <div className={`relative ${size} rounded-lg flex items-center justify-center transition-all ${filled ? filledClass : emptyClass}`}>
      <svg viewBox="0 0 24 24" className={`${iconSize} ${filled ? "text-black/40" : isFemale ? "text-pink-500/40" : gender === 'male' ? "text-blue-500/40" : "text-neutral-700"}`}>
        <path fill="currentColor" d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-2 .9-2 2v3.8h1.5c1.38 0 2.5 1.12 2.5 2.5S4.88 15.8 3.5 15.8H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/>
      </svg>
    </div>
  );
}

/**
 * 슬롯 배치 순서 계산: 남자 슬롯 먼저, 여자 슬롯 뒤.
 * 각 슬롯에서 채워진 만큼은 filled=true, 나머지는 빈 슬롯.
 * 방장은 본인 성별 슬롯의 첫 자리에 배치 (isLeader=true).
 */
export function buildPuzzleSlotLayout(puzzle: {
  target_male?: number;
  target_female?: number;
  current_male?: number;
  current_female?: number;
  target_count: number;
  current_count: number;
  leader?: { gender?: 'male' | 'female' | null } | null;
}): { gender: 'male' | 'female'; filled: boolean; isLeader: boolean }[] {
  const tM = puzzle.target_male ?? 0;
  const tF = puzzle.target_female ?? 0;
  // 슬롯 데이터가 비어있는 레거시 퍼즐: 모두 동일 색 (구 동작 보존)
  if (tM + tF === 0) {
    return Array.from({ length: puzzle.target_count }).map((_, i) => ({
      gender: 'male' as const,
      filled: i < puzzle.current_count,
      isLeader: i === 0,
    }));
  }
  const cM = Math.min(puzzle.current_male ?? 0, tM);
  const cF = Math.min(puzzle.current_female ?? 0, tF);
  const leaderGender = puzzle.leader?.gender ?? null;
  // 방장 성별 슬롯에 isLeader 첫 자리 부여
  let leaderAssigned = false;
  const out: { gender: 'male' | 'female'; filled: boolean; isLeader: boolean }[] = [];
  for (let i = 0; i < tM; i++) {
    const filled = i < cM;
    const isLeader = filled && !leaderAssigned && leaderGender === 'male';
    if (isLeader) leaderAssigned = true;
    out.push({ gender: 'male', filled, isLeader });
  }
  for (let i = 0; i < tF; i++) {
    const filled = i < cF;
    const isLeader = filled && !leaderAssigned && leaderGender === 'female';
    if (isLeader) leaderAssigned = true;
    out.push({ gender: 'female', filled, isLeader });
  }
  return out;
}

export const PuzzleCard = memo(function PuzzleCard({
  puzzle,
  userRole,
  offerCount = 0,
  isMember = false,
  hasOffered = false,
  hideNewBadge = false,
  onJoin,
  onUnlock,
}: PuzzleCardProps) {
  const router = useRouter();
  const totalBudget = puzzle.total_budget ?? (puzzle.budget_per_person * puzzle.target_count);
  const perPersonBudget = puzzle.total_budget
    ? Math.floor(puzzle.total_budget / puzzle.target_count)
    : puzzle.budget_per_person;

  // Migration 171: age_pref가 배열. 'any' 포함 시 null, 외엔 라벨 조합 ("20초·20후")
  const ageTag = puzzle.age_pref.includes("any")
    ? null
    : puzzle.age_pref.map((a) => AGE_LABEL[a]).filter(Boolean).join("·") || null;
  const vibeTag = VIBE_LABEL[puzzle.vibe_pref];
  const musicTag = puzzle.music_preference ? MUSIC_LABEL[puzzle.music_preference] : null;
  const tags = puzzle.is_recruiting_party
    ? ([ageTag, vibeTag, musicTag].filter(Boolean) as string[])
    : [];

  const leaderTier = getDealTier(puzzle.leader?.deal_count_total ?? 0);

  const isMd = userRole === "md" || userRole === "admin";
  const isRecruitingParty = puzzle.is_recruiting_party;
  const isFull = puzzle.current_count >= puzzle.target_count;
  const isSmall = puzzle.target_count > 8;
  const isNew = Date.now() - new Date(puzzle.created_at).getTime() < 6 * 60 * 60 * 1000;

  // MD가 퍼즐(모집 중)을 찜할 수 있음 — 인원 부족/예산 큰 거 트래킹
  const { isFavoritedPuzzle, toggleFavoritePuzzle } = usePuzzleFavoritesContext();
  const isFavorited = isFavoritedPuzzle(puzzle.id);
  const canFavorite = isMd && isRecruitingParty;

  return (
    <div className="relative bg-[#1C1C1E] rounded-2xl p-4 space-y-3">
      {isNew && !hideNewBadge && (
        <div
          className="animate-new-badge pointer-events-none absolute -top-4 -right-2.5 z-10 px-2.5 py-1 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white text-[10px] font-black tracking-widest select-none"
          aria-label="6시간 이내 등록"
        >
          NEW!
        </div>
      )}
      {/* 상단: 메모(방 제목) + 지역 + 거래 등급 배지 (찜 자리) */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1 flex-1 pr-3">
          <div className="text-[18px] font-black leading-snug break-keep tracking-tight">
            <span className="text-white">{puzzle.notes || `${puzzle.area}에서 모여요`}</span>
            {puzzle.notes && (
              <span className="text-neutral-500 text-[14px] ml-1.5 font-bold tracking-normal align-middle">
                {puzzle.area}
              </span>
            )}
          </div>
          {puzzle.leader?.display_name && (
            <p className="text-[12px] text-neutral-500 font-medium">
              방장 · {puzzle.leader.display_name}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {isRecruitingParty && !isFull ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[11px] font-bold">
              🧩 퍼즐
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-bold">
              🚩 깃발
            </span>
          )}
          <div className="flex items-center gap-1">
            {canFavorite && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavoritePuzzle(puzzle.id); }}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isFavorited ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25" : "bg-neutral-800/80 text-neutral-400 hover:bg-neutral-700 hover:text-amber-300"}`}
                aria-label={isFavorited ? "알림 해제" : "알림받기"}
              >
                <Bell className={`w-3.5 h-3.5 ${isFavorited ? "fill-current" : ""}`} />
              </button>
            )}
            <span className="inline-flex items-center justify-center shrink-0 min-w-8 h-8" title={`거래 ${puzzle.leader?.deal_count_total ?? 0}회`}>
              <TrustBadge tier={leaderTier} size="md" />
            </span>
          </div>
        </div>
      </div>

      {/* 예산 및 인원 정보 그룹 */}
      <div className="flex flex-col gap-1.5">
        {isRecruitingParty ? (
          <>
            {/* 파티원 모집 중: 예산/인원 진행 바 */}
            <div className="flex items-baseline gap-1">
              <span className="text-[18px] font-black text-green-400">
                현재 {(perPersonBudget * puzzle.current_count).toLocaleString()}원
              </span>
              <span className="text-[14px] font-bold text-neutral-600">/</span>
              <span className="text-[14px] font-bold text-neutral-500">
                목표 {totalBudget.toLocaleString()}원
              </span>
            </div>
            <div className="space-y-1">
              {isFull && (
                <span className="text-[13px] text-green-400 font-bold">
                  퍼즐 완성! 🎉
                </span>
              )}
              <div className="flex flex-wrap gap-1.5">
                {buildPuzzleSlotLayout(puzzle).map((slot, i) => (
                  <PuzzlePiece
                    key={i}
                    filled={slot.filled}
                    isLeader={slot.isLeader}
                    gender={slot.gender}
                    small={isSmall}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 인원 확정: 총 예산 + 인원 배지 한 줄 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[18px] font-black text-green-400">
                예산 {totalBudget.toLocaleString()}원
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[11px] font-bold">
                {puzzle.target_count}명
              </span>
            </div>
          </>
        )}
      </div>

      {/* MD 제안 현황: MD는 컴팩트 메트릭(0/N offers), 일반 유저는 문장형 */}
      {isMd ? (
        <p className="text-[12px] text-amber-400 font-bold tabular-nums">
          {offerCount} {offerCount === 1 ? "offer" : "offers"}
        </p>
      ) : offerCount > 0 ? (
        <p className="text-[12px] text-amber-400 font-bold">
          MD {offerCount}명이 줄서있어요
        </p>
      ) : null}

      {/* 취향 태그 */}
      {tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap pt-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* CTA 버튼 (등록일시는 우측 상단에 absolute로 띄움) */}
      <div className="relative">
        <p
          className="absolute -top-5 right-1 text-[10px] text-neutral-500 whitespace-nowrap pointer-events-none"
          suppressHydrationWarning
        >
          {formatRelativeTime(puzzle.created_at)}
        </p>
      {isMd ? (
        hasOffered ? (
          <Button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="w-full h-11 font-black text-[13px] rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 pointer-events-none"
          >
            제안 완료
          </Button>
        ) : (
          <Button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUnlock?.(puzzle); }}
            className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-black font-black text-[13px] rounded-xl"
          >
            {offerCount === 0 ? "가장 먼저 제안하기" : "나도 제안하기"}
          </Button>
        )
      ) : !isRecruitingParty ? (
        // 인원 확정 깃발: 참여 불가, 상세로 이동
        <Button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/flags/${puzzle.id}`); }}
          className="w-full h-11 font-black text-[13px] rounded-xl transition-all active:scale-[0.98] bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800"
        >
          자세히 보기
        </Button>
      ) : isFull ? (
        <div className="space-y-2">
          <p className="text-[12px] text-neutral-500 font-medium text-center">파티 마감</p>
          <Button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              trackEvent("puzzle_cta_click", { source: "card" });
              router.push("/flags/new");
            }}
            className="w-full h-11 font-black text-[13px] rounded-xl transition-all active:scale-[0.98] bg-white hover:bg-neutral-200 text-black"
          >
            나도 파티원 모집하기 →
          </Button>
        </div>
      ) : isMember ? (
        <Button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="w-full h-11 font-black text-[13px] rounded-xl transition-all bg-green-500/15 border border-green-500/30 text-green-400 pointer-events-none"
        >
          합류 완료
        </Button>
      ) : (
        <Button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onJoin?.(puzzle); }}
          className="w-full h-11 font-black text-[13px] rounded-xl transition-all active:scale-[0.98] bg-white hover:bg-neutral-200 text-black"
        >
          합류하기
        </Button>
      )}
      </div>
    </div>
  );
});
