"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Puzzle, GenderPref, AgePref, VibePref, MusicPref } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";
import { TrustBadge } from "@/components/ui/TrustBadge";
import { getDealTier } from "@/lib/utils/dealTier";
import { formatRelativeTime, getDDayLabel } from "@/lib/utils/format";

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
  hiphop: "힙합 선호",
  edm: "EDM 선호",
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
  // 모집 모드: 연령·바이브·음악을 취향 태그 줄에 함께 노출.
  // 인원 확정 깃발: 음악은 예산 줄에 인라인으로 붙여 지역 위치가 밀리지 않게 함(별도 줄 X).
  const tags = puzzle.is_recruiting_party
    ? ([ageTag, vibeTag, musicTag].filter(Boolean) as string[])
    : [];

  const leaderTier = getDealTier(puzzle.leader?.deal_amount_total ?? 0);

  const isMd = userRole === "md" || userRole === "admin";
  const isRecruitingParty = puzzle.is_recruiting_party;
  const isFull = puzzle.current_count >= puzzle.target_count;
  const isSmall = puzzle.target_count > 8;
  const isNew = Date.now() - new Date(puzzle.created_at).getTime() < 6 * 60 * 60 * 1000;
  const isSelecting = puzzle.status === "selecting";

  // 유저용 오퍼 현황 배지 — "꽂으면 MD 오퍼가 온다"는 사회적 증명을 강조.
  // 🔥 + 숫자 강조는 살리되 문구는 기존 그대로. 0개면 표시하지 않음.
  const userOfferBadge =
    offerCount > 0 ? (
      <span className="text-[12px] font-bold text-amber-400">
        {/* 3개 이상 = 경쟁이 붙은 핫한 깃발일 때만 🔥로 강조 */}
        {offerCount >= 3 && <span aria-hidden>🔥 </span>}
        오퍼 <span className="text-[14px] font-black tabular-nums">{offerCount}</span>개 중에서 고르는중
      </span>
    ) : null;

  // 카드 전체 클릭 가능 — 내부 액션 버튼들은 stopPropagation으로 보호됨
  const isCardClickable = true;

  return (
    <div
      className={`relative bg-[#1C1C1E] rounded-2xl p-3 flex flex-col gap-2 h-full ${isCardClickable ? "cursor-pointer active:scale-[0.98] transition-all" : ""}`}
      onClick={isCardClickable ? () => router.push(`/flags/${puzzle.id}`) : undefined}
    >
      {isNew && !hideNewBadge && !isSelecting && (
        <div
          className="animate-new-badge pointer-events-none absolute top-2 right-2 z-10 px-2.5 py-1 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white text-[10px] font-black tracking-widest select-none"
          aria-label="6시간 이내 등록"
        >
          NEW!
        </div>
      )}
      {/* 상단: 메모(방 제목) + 지역 + 거래 등급 배지 (찜 자리) */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="text-[16px] font-bold leading-snug break-keep tracking-tight line-clamp-2 text-neutral-100">
            {puzzle.notes || `${puzzle.area}에서 모여요`}
          </div>
          {puzzle.leader?.display_name && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[12px] text-neutral-500 font-medium">
                by {puzzle.leader.display_name}
              </p>
              {leaderTier && <TrustBadge tier={leaderTier} size="sm" />}
              {isMd && puzzle.area && (
                <p className="text-[12px] text-neutral-500 font-medium">· {puzzle.area}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isSelecting && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-neutral-700/60 text-neutral-300 text-[11px] font-bold">
              검토 중
            </span>
          )}
          {!isSelecting && !(isNew && !hideNewBadge) && (
            isRecruitingParty && !isFull ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[11px] font-bold">
                🧩
              </span>
            ) : (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-black text-[11px]" style={{lineHeight: 1, paddingLeft: '2px', paddingBottom: '2px'}}>
                🚩
              </span>
            )
          )}
        </div>
      </div>

      {/* 예산 및 인원 정보 그룹 — 카드 하단에 고정 */}
      <div className="flex flex-col gap-1.5 mt-auto">
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
            {/* 인원 확정: 총 예산 + 인원 배지 + 음악 한 줄 (음악을 별도 줄로 빼면 지역 위치가 밀림) */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[18px] font-black text-green-400">
                예산 {totalBudget.toLocaleString()}원
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[11px] font-bold">
                {puzzle.target_count}명
              </span>
              {musicTag && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 text-[11px] font-medium">
                  {musicTag}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* MD 제안 현황: MD는 CTA 행에 통합, 일반 유저는 문장형 */}
      {!isMd && offerCount > 0 && isRecruitingParty ? (
        // 모집 중 깃발은 위쪽에 별도로 표시. 인원 확정 깃발은 자세히 보기 버튼 옆으로 이동.
        userOfferBadge
      ) : null}

      {/* 취향 태그 */}
      {tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap pt-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* CTA 버튼 (작성날짜는 카드 상단 깃발 배지 아래로 이동) */}
      <div className="relative -mt-2">
      {isMd ? (
        // MD: 풀 버튼 대신 작고 둥근 자세히 스타일 버튼 — 오퍼수 + 버튼 한 행
        <div className="flex items-center justify-between gap-2">
          {offerCount > 0 && (
            <span className="text-[12px] text-amber-400 font-bold tabular-nums">{offerCount} offers</span>
          )}
          <div className="ml-auto">
            {isSelecting ? (
              <Button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                className="h-8 px-3 rounded-full font-black text-[12px] shrink-0 bg-neutral-800 border border-neutral-700 text-neutral-400 pointer-events-none"
              >
                검토 중
              </Button>
            ) : hasOffered ? (
              <Button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                className="h-8 px-3 rounded-full font-black text-[12px] shrink-0 bg-amber-500/15 border border-amber-500/30 text-amber-400 pointer-events-none"
              >
                제안 완료
              </Button>
            ) : (
              <Button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUnlock?.(puzzle); }}
                className="h-8 px-3 rounded-full font-black text-[12px] shrink-0 bg-amber-500 hover:bg-amber-400 text-black shadow-[0_2px_12px_rgba(245,158,11,0.35)] active:scale-[0.97] transition-all"
              >
                제안하기
              </Button>
            )}
          </div>
        </div>
      ) : !isRecruitingParty ? (
        // 인원 확정 깃발: 카드 전체 클릭으로 상세 이동 (별도 버튼 불필요)
        // 지역은 오퍼 유무와 무관하게 항상 오른쪽 고정 (ml-auto). 오퍼배지가 null이면
        // justify-between만으론 지역이 왼쪽으로 붙어버려 위치가 오락가락함.
        <div className="flex items-center gap-2">
          {userOfferBadge}
          {/* 조각 카드와 통일된 우하단 CTA — 카드 onClick(상세 이동)을 막지 않아 동일 동작 */}
          <Button
            tabIndex={-1}
            className="ml-auto h-8 px-3 rounded-full font-black text-[12px] shrink-0 bg-amber-500 hover:bg-amber-400 text-black shadow-[0_2px_12px_rgba(245,158,11,0.35)] active:scale-[0.97] transition-all"
          >
            자세히
          </Button>
        </div>
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
