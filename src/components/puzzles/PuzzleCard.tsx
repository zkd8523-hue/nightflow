"use client";

import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { Share2, BadgeCheck, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ShareCreatedSheet } from "./ShareCreatedSheet";
import { Button } from "@/components/ui/button";
import type { Puzzle, GenderPref, AgePref, VibePref, MusicPref } from "@/types/database";
import { TrustBadge } from "@/components/ui/TrustBadge";
import { getDealTier } from "@/lib/utils/dealTier";
import { formatRelativeTime, getDDayLabel, formatGenderComposition } from "@/lib/utils/format";
import { countryFlag, countryNameKo } from "@/lib/utils/countryFlag";
import { useTranslatedText } from "@/hooks/useTranslatedComment";

interface PuzzleCardProps {
  puzzle: Puzzle;
  userRole?: "user" | "md" | "admin";
  offerCount?: number;
  isMember?: boolean;
  /** 현재 유저가 이 퍼즐의 방장인지 — 조각 카드에서 "내 조각" 표시용 */
  isLeader?: boolean;
  hasOffered?: boolean;
  hideNewBadge?: boolean;
  /** MY 화면 전용 — 종료된 내 깃발/조각 상태 뱃지 (우상단, area 아래) */
  myFlagStatus?: { text: string; tone: string };
  /** MY 화면 전용 — 삭제(숨김) 콜백. 있으면 우상단 X 버튼 노출 */
  onHide?: () => void;
  onJoin?: (puzzle: Puzzle) => void;
  onUnlock?: (puzzle: Puzzle) => void;
}

const GENDER_LABEL: Record<GenderPref, string | null> = {
  male_only: "남",
  female_only: "녀",
  any: null,
};

const AGE_LABEL: Record<AgePref, string | null> = {
  "20s": "20대",
  "30s": "30대",
  early_20s: "20초",
  late_20s: "20후",
  early_30s: "30초",
  mid_30s: "30중",
  any: null,
};

// 바이브 라벨 (PuzzleForm과 동기화): 내향/외향 축
const VIBE_LABEL: Record<VibePref, string | null> = {
  chill: "내향인",
  active: "외향인",
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
  const size = small ? "w-8 h-8" : "w-9 h-9";
  const iconSize = small ? "w-4 h-4" : "w-5 h-5";
  const isFemale = gender === 'female';
  const isNeutral = gender == null;

  const filledClass = isFemale
    ? isLeader
      ? "bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.4)]"
      : "bg-pink-500/80"
    : isNeutral
      ? isLeader
        ? "bg-green-500"
        : "bg-green-500/80"
      : isLeader
        ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]"
        : "bg-blue-500/80";

  const emptyClass = isFemale
    ? "bg-neutral-800/50 border border-dashed border-pink-500/40"
    : gender === 'male'
      ? "bg-neutral-800/50 border border-dashed border-blue-500/40"
      : isNeutral
        ? "bg-neutral-800/50 border border-dashed border-green-500/40"
        : "bg-neutral-800/50 border border-dashed border-neutral-600";

  return (
    <div className={`relative ${size} rounded-lg flex items-center justify-center transition-all ${filled ? filledClass : emptyClass}`}>
      <svg viewBox="0 0 24 24" className={`${iconSize} ${filled ? "text-black/40" : isFemale ? "text-pink-500/40" : gender === 'male' ? "text-blue-500/40" : "text-green-500/40"}`}>
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
}): { gender: 'male' | 'female' | null; filled: boolean; isLeader: boolean }[] {
  const tM = puzzle.target_male ?? 0;
  const tF = puzzle.target_female ?? 0;
  // 성별 슬롯 없음(조각 등 성별 무관): 중립(초록)으로 통일
  if (tM + tF === 0) {
    return Array.from({ length: puzzle.target_count }).map((_, i) => ({
      gender: null,
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
  isLeader = false,
  hasOffered = false,
  hideNewBadge = false,
  myFlagStatus,
  onHide,
  onJoin,
  onUnlock,
}: PuzzleCardProps) {
  const router = useRouter();
  // MD 직통 조각: 방장(MD)이 카드에서 "이미 찬 자리(외부 인원)" 조정
  // 옛 AuctionCard 패턴 — +/-로 델타 누적(슬롯 즉시 미리 차고) → "반영"으로 저장
  const [committedCount, setCommittedCount] = useState(puzzle.current_count);
  const [extDelta, setExtDelta] = useState(0);
  const [savingExt, setSavingExt] = useState(false);
  const canAdjustExternal = isLeader && !!puzzle.host_is_md;
  const displayCount = Math.max(1, Math.min(puzzle.target_count, committedCount + extDelta));
  const applyExternal = async () => {
    if (savingExt || extDelta === 0) return;
    setSavingExt(true);
    const { data } = await createClient().rpc("adjust_share_host_external", { p_puzzle_id: puzzle.id, p_delta: extDelta });
    setSavingExt(false);
    if (data?.success) {
      setCommittedCount(data.current_count);
      setExtDelta(0);
      const remaining = puzzle.target_count - data.current_count;
      toast.success(remaining > 0 ? `반영됐어요! · ${remaining}자리 남음` : "반영됐어요! · 꽉 찼어요 🎉");
    } else if (data?.error) toast.error(data.error);
  };
  const totalBudget = puzzle.total_budget ?? (puzzle.budget_per_person * puzzle.target_count);
  const perPersonBudget = puzzle.total_budget
    ? Math.floor(puzzle.total_budget / puzzle.target_count)
    : puzzle.budget_per_person;

  // 조각 카드 공유 → 카톡 공유 시트 (상세와 동일)
  const [shareOpen, setShareOpen] = useState(false);
  // 아이콘 전용 공유 (조각 카드 컴팩트 — 지역 라벨 밑)
  const shareIconBtn = (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShareOpen(true); }}
      aria-label="공유"
      className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center shrink-0 transition-colors active:scale-[0.97]"
    >
      <Share2 className="w-3.5 h-3.5" />
    </button>
  );
  const shareSheet = shareOpen ? (
    <ShareCreatedSheet
      puzzleId={puzzle.id}
      eventDate={puzzle.event_date}
      area={puzzle.area}
      perPerson={perPersonBudget}
      mode="share"
      hostIsMd={puzzle.host_is_md}
      clubName={puzzle.club?.name}
      clubThumbnail={puzzle.club?.thumbnail_url}
      onClose={() => setShareOpen(false)}
    />
  ) : null;

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

  // 외국어로 쓴 깃발 notes를 한국 화면에선 한국어로 번역 (작성자 lang != ko일 때).
  // 한국 MD가 일본인/중국인 깃발을 읽고 오퍼할 수 있게. (소스 언어 자동감지, 캐시)
  const leaderLang = (puzzle.leader as { lang?: string } | null | undefined)?.lang;
  const notesKo = useTranslatedText(puzzle.notes, "ko", !!leaderLang && leaderLang !== "ko");
  const displayNotes = notesKo ?? puzzle.notes;

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
      className={`relative bg-[#1C1C1E] rounded-xl p-3 flex flex-col gap-2 ${isCardClickable ? "cursor-pointer active:scale-[0.98] transition-all" : ""}`}
      onClick={isCardClickable ? () => router.push(`/flags/${puzzle.id}`) : undefined}
    >
      {shareSheet}
      {isNew && !hideNewBadge && !isSelecting && (
        <div
          className="animate-new-badge pointer-events-none absolute -top-2 -right-1 z-10 px-2.5 py-1 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white text-[10px] font-black tracking-widest select-none shadow-lg shadow-rose-900/40"
          aria-label="6시간 이내 등록"
        >
          NEW!
        </div>
      )}
      {/* 상단: 메모(방 제목) + 지역 + 거래 등급 배지 (찜 자리) */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="text-[16px] font-bold leading-snug break-keep tracking-tight line-clamp-2 text-neutral-100">
            {displayNotes || `${puzzle.area}에서 모여요`}
          </div>
          {(puzzle.leader?.display_name || tags.length > 0) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {puzzle.leader?.display_name && (
                <p className="text-[12px] text-neutral-500 font-medium">
                  by {puzzle.leader.display_name}
                </p>
              )}
              {puzzle.host_is_md && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[11px] font-bold whitespace-nowrap">
                  <BadgeCheck className="w-3 h-3" />파트너 직통
                </span>
              )}
              {puzzle.leader?.country_code && puzzle.leader.country_code !== "KR" && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-[11px] font-bold text-neutral-300">
                  {countryFlag(puzzle.leader.country_code)}
                  {countryNameKo(puzzle.leader.country_code)}
                </span>
              )}
              {leaderTier && <TrustBadge tier={leaderTier} size="sm" />}
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
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1">
            {puzzle.area && (
              <span className="text-[12px] font-bold text-neutral-300 whitespace-nowrap">
                {puzzle.area}
              </span>
            )}
            {/* MY 종료 깃발 삭제 */}
            {onHide && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(); }}
                className="p-0.5 -mr-1 text-neutral-600 hover:text-red-400 transition-colors"
                aria-label="삭제"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* MY 종료 깃발 상태 뱃지 */}
          {myFlagStatus && (
            <span className={`text-[12px] font-bold whitespace-nowrap ${myFlagStatus.tone}`}>
              {myFlagStatus.text}
            </span>
          )}
          {/* 공유 아이콘 — 지역 밑 (조각만) */}
          {isRecruitingParty && !myFlagStatus && shareIconBtn}
        </div>
      </div>

      {/* 예산 및 인원 정보 그룹 — 닉네임 바로 아래 고정 간격 (mt-auto 제거: 카드 높이 따라 간격 벌어지던 문제) */}
      <div className="flex flex-col gap-1.5 mt-1">
        {isRecruitingParty ? (
          <>
            {/* 파티원 모집 중: 예산 표시 — 전원 동일하게 1인/현재 (역할 구분 없음) */}
            <div className="flex items-baseline gap-1">
              <span className="text-[18px] font-black text-green-400">
                1인 {perPersonBudget.toLocaleString()}원
              </span>
              <span className="text-[14px] font-bold text-neutral-600">/</span>
              <span className="text-[14px] font-bold text-neutral-500">
                현재 {(perPersonBudget * puzzle.current_count).toLocaleString()}원
              </span>
            </div>
            <div className="space-y-1">
              {isFull && (
                <span className="text-[13px] text-green-400 font-bold">
                  퍼즐 완성! 🎉
                </span>
              )}
              <div className="flex flex-wrap gap-1">
                {buildPuzzleSlotLayout({ ...puzzle, current_count: canAdjustExternal ? displayCount : puzzle.current_count }).map((slot, i) => (
                  <PuzzlePiece
                    key={i}
                    filled={slot.filled}
                    isLeader={slot.isLeader}
                    gender={slot.gender}
                    small={isSmall}
                  />
                ))}
              </div>
              {/* 방장(MD) 전용: 이미 찬 자리(외부 인원) — 델타 누적 후 "반영"으로 저장 */}
              {canAdjustExternal && (
                <div className="flex items-center gap-2 pt-1.5">
                  <span className="text-[11px] text-neutral-500 font-bold">인원 수정</span>
                  <button
                    type="button"
                    disabled={savingExt || displayCount <= 1}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExtDelta((d) => d - 1); }}
                    className="w-6 h-6 rounded-full bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center disabled:opacity-30 transition-colors"
                  >
                    <Minus className="w-3 h-3 text-white" />
                  </button>
                  <span className="text-[13px] font-black text-white tabular-nums w-4 text-center">{displayCount}</span>
                  <button
                    type="button"
                    disabled={savingExt || displayCount >= puzzle.target_count}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExtDelta((d) => d + 1); }}
                    className="w-6 h-6 rounded-full bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center disabled:opacity-30 transition-colors"
                  >
                    <Plus className="w-3 h-3 text-white" />
                  </button>
                  {extDelta !== 0 && (
                    <button
                      type="button"
                      disabled={savingExt}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); applyExternal(); }}
                      className="ml-1 px-3 h-6 rounded-full bg-white text-black text-[11px] font-black active:scale-95 transition disabled:opacity-50"
                    >
                      {savingExt ? "저장중" : "적용"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* 인원 확정: 총 예산 + 인원 배지 + 음악 한 줄 (음악을 별도 줄로 빼면 지역 위치가 밀림) */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[18px] font-black text-green-400">
                예산 {totalBudget.toLocaleString()}원
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[11px] font-bold">
                {formatGenderComposition(puzzle.target_male, puzzle.target_female, puzzle.target_count)}
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

      {/* 방장 추가설명(leader_comment) — 상세 페이지와 동일 인용구, 카드에선 2줄 clamp */}
      {puzzle.leader_comment && (
        <p className="text-[13px] leading-relaxed text-neutral-300 border-l border-neutral-600 pl-2.5 line-clamp-2 break-words [overflow-wrap:anywhere]">
          &ldquo;{puzzle.leader_comment}&rdquo;
        </p>
      )}

      {/* 조각 오퍼 현황은 하단 CTA 행에 자세히와 같은 행으로 통합됨 (깃발과 동일) */}

      {/* CTA 버튼 (작성날짜는 카드 상단 깃발 배지 아래로 이동) */}
      {/* 조각/깃발 모두 동일 간격으로 통일 (모바일에서 퍼즐피스와 겹치지 않게 -mt-1로 살짝 완화) */}
      <div className="relative -mt-1">
      {isMd ? (
        // MD: 풀 버튼 대신 작고 둥근 자세히 스타일 버튼 — 오퍼수 + 버튼 한 행
        <div className="flex items-center justify-between gap-2">
          {offerCount > 0 && (
            <span className="text-[12px] text-amber-400 font-bold tabular-nums">{offerCount} offers</span>
          )}
          <div className="ml-auto flex items-center gap-2">
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
            ) : puzzle.host_is_md ? (
              /* MD 직통 조각엔 다른 MD가 오퍼 불가 (남의 클럽 직통) → 자세히로 대체해 CTA 높이 통일 */
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/flags/${puzzle.id}`); }}
                className="text-[13px] font-bold text-neutral-300 hover:text-white active:scale-[0.97] transition-all shrink-0"
              >
                자세히
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUnlock?.(puzzle); }}
                className="text-[13px] font-bold text-amber-200 hover:text-amber-100 active:scale-[0.97] transition-all shrink-0"
              >
                {offerCount > 0 ? "나도 오퍼하기 →" : "먼저 오퍼하기 →"}
              </button>
            )}
          </div>
        </div>
      ) : !isRecruitingParty ? (
        // 깃발: 오퍼수(왼쪽) + "자세히"(우측). 유저·비로그인 모두 노출.
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{userOfferBadge}</div>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/flags/${puzzle.id}`); }}
            className="text-[13px] font-bold text-neutral-300 hover:text-white active:scale-[0.97] transition-all shrink-0"
          >
            자세히
          </button>
        </div>
      ) : isFull ? (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-neutral-500 font-medium">파티 마감</span>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/flags/${puzzle.id}`); }}
            className="ml-auto text-[13px] font-bold text-neutral-300 hover:text-white active:scale-[0.97] transition-all shrink-0"
          >
            자세히
          </button>
        </div>
      ) : isLeader ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{userOfferBadge}</div>
          <Button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="h-8 px-3 rounded-full font-black text-[12px] transition-all bg-neutral-800 border border-neutral-700 text-neutral-300 pointer-events-none shrink-0"
          >
            내 조각
          </Button>
        </div>
      ) : isMember ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{userOfferBadge}</div>
          <Button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="h-8 px-3 rounded-full font-black text-[12px] transition-all bg-green-500/15 border border-green-500/30 text-green-400 pointer-events-none shrink-0"
          >
            합류 완료
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{userOfferBadge}</div>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/flags/${puzzle.id}`); }}
            className="text-[13px] font-bold text-neutral-300 hover:text-white active:scale-[0.97] transition-all shrink-0"
          >
            자세히
          </button>
        </div>
      )}
      </div>
    </div>
  );
});
