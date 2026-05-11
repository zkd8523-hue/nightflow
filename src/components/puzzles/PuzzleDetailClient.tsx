"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Users, CheckCircle2, Undo2, Building2, Share2, ShieldCheck, Pencil, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { PuzzleJoinSheet } from "./PuzzleJoinSheet";
import { OfferSheet } from "./OfferSheet";
import { OfferAcceptSheet } from "./OfferAcceptSheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MDContactCard } from "./MDContactCard";
import { CopyAcceptedMessageButton } from "./CopyAcceptedMessageButton";
import { AdminCancelPuzzleButton } from "@/components/admin/AdminCancelPuzzleButton";
import { SecretOfferCard } from "./SecretOfferCard";
import { PuzzlePiece } from "./PuzzleCard";
import type { Puzzle, PuzzleMember, PuzzleOffer, GenderPref, AgePref, VibePref, PublicUserProfile } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";
import { getPublicIncludes } from "@/lib/utils/liquor";
import { TrustBadge } from "@/components/ui/TrustBadge";
import { getDealTier, isNewUser } from "@/lib/utils/dealTier";
import { LeaderInfoSheet } from "./LeaderInfoSheet";

interface PuzzleLeaderInfo {
  id: string;
  name: string | null;
  display_name: string | null;
  profile_image: string | null;
  phone: string | null;
  instagram: string | null;
  role: string | null;
  strike_count: number | null;
  is_blocked: boolean | null;
}

interface PuzzleDetailClientProps {
  puzzle: Puzzle;
  members: PuzzleMember[];
  currentUserId?: string;
  userRole?: "user" | "md" | "admin";
  leader?: PuzzleLeaderInfo | null;
  currentUserKakaoUrl?: string | null;
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
  any: null,
};
const VIBE_LABEL: Record<VibePref, string | null> = {
  chill: "조용히",
  active: "신나게",
  any: null,
};

function formatEventDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}월 ${day}일 (${days[d.getDay()]})`;
}

const STATUS_LABEL: Record<string, string> = {
  open: "모집 중",
  matched: "마감",
  accepted: "성사됨",
  cancelled: "취소됨",
  expired: "만료됨",
};

const OFFER_STATUS_LABEL: Record<string, string> = {
  pending: "제안 중",
  accepted: "수락됨",
  rejected: "거절됨",
  withdrawn: "철회됨",
  expired: "미선택",
};

export function PuzzleDetailClient({
  puzzle,
  members,
  currentUserId,
  userRole,
  leader,
  currentUserKakaoUrl,
}: PuzzleDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    if (searchParams.get("edit_blocked") === "offers") {
      toast.error("MD 제안이 들어온 깃발은 수정할 수 없어요");
      router.replace(`/flags/${puzzle.id}`);
    }
  }, [searchParams, router, puzzle.id]);

  const [showJoin, setShowJoin] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [editingOffer, setEditingOffer] = useState<PuzzleOffer | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [offers, setOffers] = useState<PuzzleOffer[]>([]);
  const [myOffer, setMyOffer] = useState<PuzzleOffer | null>(null);
  const [acceptedOffer, setAcceptedOffer] = useState<PuzzleOffer | null>(null);
  const [showAcceptSheet, setShowAcceptSheet] = useState(false);
  const [pendingAcceptOfferId, setPendingAcceptOfferId] = useState<string | null>(null);
  const [acceptingMd, setAcceptingMd] = useState<NonNullable<PuzzleOffer["md"]> | null>(null);
  const [showKakaoNotice, setShowKakaoNotice] = useState(false);
  const [showLeaderInfo, setShowLeaderInfo] = useState(false);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/flags/${puzzle.id}`;
    const title = puzzle.notes || `${puzzle.area} 깃발`;
    const text = `${puzzle.area} · 인당 ${((puzzle.total_budget ?? puzzle.budget_per_person * puzzle.target_count) / puzzle.target_count).toLocaleString()}원 · ${puzzle.target_count}명`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // 사용자가 취소한 경우 무시
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("링크가 복사되었습니다");
    }
  }, [puzzle]);

  const isAdmin = userRole === "admin";
  const isLeader = currentUserId === puzzle.leader_id || isAdmin;
  const isMember = members.some((m) => m.user_id === currentUserId);
  const isMd = userRole === "md";
  const isRecruitingParty = puzzle.is_recruiting_party;
  // 파티원 모집 중일 때만 인원 가득 찬 개념이 의미 있음
  const isFull = isRecruitingParty && puzzle.current_count >= puzzle.target_count;
  const isOpen = puzzle.status === "open" && !isFull;
  const isAccepted = puzzle.status === "accepted";
  // 하위 호환: V1 퍼즐은 budget_per_person, V2는 total_budget 사용
  const baseBudget = puzzle.total_budget ?? (puzzle.budget_per_person * puzzle.target_count);
  const perPersonBudget = puzzle.total_budget
    ? Math.floor(puzzle.total_budget / puzzle.target_count)
    : puzzle.budget_per_person;
  const fillRate = Math.round((puzzle.current_count / puzzle.target_count) * 100);

  const genderTag = GENDER_LABEL[puzzle.gender_pref];
  const ageTag = AGE_LABEL[puzzle.age_pref];
  const vibeTag = VIBE_LABEL[puzzle.vibe_pref];
  const tags = puzzle.is_recruiting_party
    ? ([genderTag, ageTag, vibeTag].filter(Boolean) as string[])
    : [];

  const loadOffers = useCallback(async () => {
    // 1단계: pending/accepted 오퍼는 식별 정보(display_name 등) 없이 조회.
    // 거래 횟수만 신뢰도 지표로 노출.
    const { data } = await supabase
      .from("puzzle_offers")
      .select("*, club:clubs(id, name, area), md:public_user_profiles!puzzle_offers_md_id_fkey(md_deal_count)")
      .eq("puzzle_id", puzzle.id)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: true });

    if (!data) return;
    let merged = data as PuzzleOffer[];

    // 2단계: 수락된 오퍼만 별도로 MD 식별 정보 조회 (방장 또는 MD 본인에게만).
    if (puzzle.accepted_offer_id && (isLeader || isMd)) {
      const { data: acceptedWithMd } = await supabase
        .from("puzzle_offers")
        .select("id, md:public_user_profiles!puzzle_offers_md_id_fkey(id, display_name, profile_image, md_deal_count, instagram, phone, kakao_open_chat_url, preferred_contact_methods)")
        .eq("id", puzzle.accepted_offer_id)
        .single();

      if (acceptedWithMd?.md) {
        const acceptedMd = acceptedWithMd.md as unknown as PuzzleOffer["md"];
        merged = merged.map((o) =>
          o.id === puzzle.accepted_offer_id
            ? ({ ...o, md: acceptedMd } as PuzzleOffer)
            : o
        );
      }
    }

    setOffers(merged);

    if (currentUserId && (isMd || isAdmin)) {
      const mine = merged.find((o) => o.md_id === currentUserId && o.status === "pending")
        || merged.find((o) => o.md_id === currentUserId && o.status === "accepted")
        || null;
      setMyOffer(mine);
    }

    if (puzzle.accepted_offer_id) {
      const accepted = merged.find((o) => o.id === puzzle.accepted_offer_id) || null;
      setAcceptedOffer(accepted);
    }
  }, [puzzle.id, puzzle.accepted_offer_id, currentUserId, isLeader, isMd, isAdmin, supabase]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const pendingOffers = offers.filter((o) => o.status === "pending");

  // 비방장용: 브랜드→카테고리 변환된 공개 오퍼 (본인 오퍼 제외)
  const publicOffers = useMemo(
    () =>
      pendingOffers
        .filter((o) => o.md_id !== currentUserId)
        .map((o) => ({ ...o, public: getPublicIncludes(o.includes) })),
    [pendingOffers, currentUserId]
  );

  const handleCancel = async () => {
    if (!confirm("깃발을 내리시겠습니까? 파티원 전원에게 알림이 발송됩니다.")) return;
    setActionLoading(true);
    try {
      // admin이 타인 깃발 내릴 때는 admin_cancel_puzzle 사용 (cancel_puzzle은 leader_id 체크)
      const rpc = isAdmin && currentUserId !== puzzle.leader_id
        ? "admin_cancel_puzzle"
        : "cancel_puzzle";
      const { data, error } = await supabase.rpc(rpc, { p_puzzle_id: puzzle.id });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "취소에 실패했습니다"); return; }
      toast.success("깃발을 내렸습니다");
      router.push("/?tab=puzzle");
    } catch {
      toast.error("취소에 실패했습니다");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm("이 깃발에서 나가시겠습니까?")) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("leave_puzzle", { p_puzzle_id: puzzle.id });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "나가기에 실패했습니다"); return; }
      toast.success("깃발에서 나왔습니다");
      router.refresh();
    } catch {
      toast.error("나가기에 실패했습니다");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("이 참여자를 제거하시겠습니까?")) return;
    try {
      const { data, error } = await supabase.rpc("remove_puzzle_member", {
        p_puzzle_id: puzzle.id,
        p_user_id: memberId,
      });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "제거에 실패했습니다"); return; }
      toast.success("자리가 조정되었습니다");
      router.refresh();
    } catch {
      toast.error("제거에 실패했습니다");
    }
  };

  const KAKAO_NOTICE_KEY = currentUserId ? `puzzle_kakao_notice_seen_${currentUserId}` : null;

  const handleAcceptOffer = (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer || !offer.md) {
      toast.error("MD 정보를 불러오지 못했습니다");
      return;
    }
    setAcceptingMd(offer.md);
    setPendingAcceptOfferId(offerId);

    // 최초 수락 시도 + 카카오 미등록 → 안내 모달 (이후엔 안 보임)
    const hasKakao = !!currentUserKakaoUrl;
    const noticeSeen = KAKAO_NOTICE_KEY && typeof window !== "undefined"
      ? localStorage.getItem(KAKAO_NOTICE_KEY) === "true"
      : true;
    if (!hasKakao && !noticeSeen) {
      setShowKakaoNotice(true);
      return;
    }

    setShowAcceptSheet(true);
  };

  const markKakaoNoticeSeen = () => {
    if (KAKAO_NOTICE_KEY && typeof window !== "undefined") {
      localStorage.setItem(KAKAO_NOTICE_KEY, "true");
    }
  };

  const handleKakaoNoticeRegister = () => {
    markKakaoNoticeSeen();
    setShowKakaoNotice(false);
    // 진행 중 수락 정보 초기화 (등록 후 다시 수락하도록)
    setPendingAcceptOfferId(null);
    setAcceptingMd(null);
    router.push("/profile");
  };

  const handleKakaoNoticeSkip = () => {
    markKakaoNoticeSeen();
    setShowKakaoNotice(false);
    setShowAcceptSheet(true);
  };

  const handleAcceptConfirm = async (): Promise<boolean> => {
    if (!pendingAcceptOfferId) return false;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("accept_offer", {
        p_offer_id: pendingAcceptOfferId,
        p_kakao_open_chat_url: null,
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error || "수락에 실패했습니다");
        return false;
      }
      trackEvent('puzzle_offer_accepted', {
        puzzle_id: puzzle.id,
        offer_id: pendingAcceptOfferId,
      });

      // 수락 직후 success step에서 MD 연락처를 보여주려면 풀 프로필이 필요.
      // 이 시점 puzzle prop은 stale(accepted_offer_id=null)이라 loadOffers()의
      // 분기에 의존할 수 없으므로 직접 조회해 acceptingMd를 갱신한다.
      const { data: acceptedFull } = await supabase
        .from("puzzle_offers")
        .select("md:public_user_profiles!puzzle_offers_md_id_fkey(id, display_name, profile_image, md_deal_count, instagram, phone, kakao_open_chat_url, preferred_contact_methods)")
        .eq("id", pendingAcceptOfferId)
        .single();
      if (acceptedFull?.md) {
        setAcceptingMd(acceptedFull.md as unknown as NonNullable<PuzzleOffer["md"]>);
      }

      // 시트는 닫지 않음 — 시트 내부에서 success step으로 전환하며 연락처 공개
      // 백그라운드로 오퍼/페이지 데이터만 갱신
      await loadOffers();
      router.refresh();
      return true;
    } catch {
      toast.error("수락에 실패했습니다");
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetKakaoUrl = async (url: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc("set_puzzle_kakao_url", {
        p_puzzle_id: puzzle.id,
        p_kakao_open_chat_url: url,
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error || "오픈채팅 링크 전달에 실패했습니다");
        return false;
      }
      trackEvent('puzzle_kakao_url_set', { puzzle_id: puzzle.id });
      router.refresh();
      return true;
    } catch {
      toast.error("오픈채팅 링크 전달에 실패했습니다");
      return false;
    }
  };

  const handleRejectOffer = async (offerId: string) => {
    if (!confirm("이 제안을 거절하시겠습니까?")) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("reject_offer", { p_offer_id: offerId });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "거절에 실패했습니다"); return; }
      toast.success("제안을 거절했습니다");
      await loadOffers();
    } catch {
      toast.error("거절에 실패했습니다");
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdrawOffer = async (offerId: string) => {
    if (!confirm("제안을 철회하시겠습니까?")) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("withdraw_offer", { p_offer_id: offerId });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "철회에 실패했습니다"); return; }
      toast.success("제안이 철회되었습니다. 슬롯이 회복되었습니다.");
      await loadOffers();
    } catch {
      toast.error("철회에 실패했습니다");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="max-w-lg mx-auto px-4">
        {/* 헤더 */}
        <div className="flex items-center gap-3 py-5">
          <Link href="/?tab=puzzle" className="text-white">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-[17px] font-black text-white flex-1">깃발 상세</h1>
          {currentUserId === puzzle.leader_id && isOpen && pendingOffers.length === 0 && (
            <Link
              href={`/flags/${puzzle.id}/edit`}
              aria-label="깃발 수정"
              className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </Link>
          )}
          {!isFull && (
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                puzzle.status === "open"
                  ? "bg-green-500/20 text-green-400"
                  : puzzle.status === "accepted"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : puzzle.status === "matched"
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-neutral-700 text-neutral-400"
              }`}
            >
              {STATUS_LABEL[puzzle.status] || puzzle.status}
            </span>
          )}
        </div>

        <div className="space-y-5 pb-10">
          {/* 기본 정보 */}
          <section className="bg-[#1C1C1E] rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {puzzle.notes && (
                  <p className="text-[18px] font-black text-white leading-snug">{puzzle.notes}</p>
                )}
                <p className={`${puzzle.notes ? "text-[14px] text-neutral-400" : "text-[22px] font-black text-white"}`}>
                  {formatEventDate(puzzle.event_date)} <span className={puzzle.notes ? "" : "text-[15px] text-neutral-400 ml-1"}>{puzzle.area}</span>
                </p>
                {puzzle.leader && (() => {
                  const dealCount = puzzle.leader.deal_count_total ?? 0;
                  return dealCount > 0 ? (
                    <span className="inline-block mt-1 text-[11px] text-neutral-500 font-bold">거래 {dealCount}회</span>
                  ) : null;
                })()}
              </div>
              <div className="flex items-center gap-1.5 -mt-1 shrink-0 flex-wrap justify-end">
                {puzzle.leader && (() => {
                  const tier = getDealTier(puzzle.leader.deal_count_total ?? 0);
                  const leaderIsNew = isNewUser(puzzle.leader.created_at);
                  return <TrustBadge tier={tier} isNew={leaderIsNew} size="sm" showLabel />;
                })()}
                {puzzle.leader && (
                  <button
                    type="button"
                    onClick={() => setShowLeaderInfo(true)}
                    className="inline-flex items-center gap-1 text-[12px] text-neutral-300 font-bold hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-full px-2 py-1 transition-colors"
                  >
                    <User className="w-3 h-3" />
                    유저 정보
                  </button>
                )}
                <button onClick={handleShare} className="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-white transition-colors -mr-1">
                  <Share2 className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* 예산 */}
            <div className="space-y-0.5">
              {isRecruitingParty ? (
                <>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[24px] font-black text-green-400">
                      현재 {(perPersonBudget * puzzle.current_count).toLocaleString()}원
                    </span>
                    <span className="text-[13px] text-neutral-500">
                      / 목표 {baseBudget.toLocaleString()}원
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[24px] font-black text-green-400">
                      예산 {baseBudget.toLocaleString()}원
                    </span>
                  </div>
                  <p className="text-[12px] text-neutral-500">
                    인원 확정 {puzzle.target_count}명
                  </p>
                </>
              )}
            </div>

            {/* 인원 퍼즐 조각: 파티원 모집 중일 때만 표시 */}
            {isRecruitingParty && (
              <div className="space-y-1.5">
                <span className="text-[13px] text-neutral-400">
                  {puzzle.current_count >= puzzle.target_count
                    ? "퍼즐 완성!"
                    : `파티원 ${puzzle.current_count}/${puzzle.target_count}명`}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: puzzle.target_count }).map((_, i) => (
                    <PuzzlePiece
                      key={i}
                      filled={i < puzzle.current_count}
                      isLeader={i === 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 취향 태그 */}
            {tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[12px] px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* 등록일시 — 우측 하단 */}
            <p className="text-[11px] text-neutral-600 text-right">
              등록 {new Date(puzzle.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
            </p>
          </section>

          {/* 카카오 오픈채팅: 참여자면 항상 표시 */}
          {(isLeader || isMember) && puzzle.kakao_open_chat_url && (
            <a
              href={puzzle.kakao_open_chat_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-[#FEE500] text-[#3C1E1E] font-bold text-[13px] rounded-xl hover:bg-[#FDD835] transition-colors animate-in slide-in-from-bottom-4 fade-in duration-500"
            >
              카카오 오픈채팅 입장하기
            </a>
          )}

          {/* 성사 기록 (accepted 상태) */}
          {isAccepted && (
            <section className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-amber-400" />
                <h2 className="text-[15px] font-black text-amber-400">성사됨</h2>
              </div>
              {acceptedOffer && (
                <div className="space-y-1">
                  <p className="text-[14px] font-bold text-white">
                    {(acceptedOffer.club as { name?: string } | null)?.name || "클럽"}
                  </p>
                  {/* 방장에게만 상세 정보 표시 */}
                  {isLeader && (
                    <div className="space-y-2 pt-2 border-t border-amber-500/20 mt-2">
                      <p className="text-[13px] text-neutral-300">
                        💰 {acceptedOffer.proposed_price.toLocaleString()}원
                      </p>
                      {acceptedOffer.includes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {acceptedOffer.includes.map((inc) => (
                            <span key={inc} className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                              {inc}
                            </span>
                          ))}
                        </div>
                      )}
                      {acceptedOffer.comment && (
                        <p className="text-[12px] text-neutral-400 italic">"{acceptedOffer.comment}"</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {isLeader && acceptedOffer && acceptedOffer.md && (() => {
                const md = acceptedOffer.md;
                const dealCount = md.md_deal_count ?? 0;
                return (
                  <>
                    <div className="flex items-center gap-3 pt-1 border-t border-amber-500/20">
                      <div className="relative shrink-0">
                        {md.profile_image ? (
                          <img src={md.profile_image} alt={md.display_name || "MD"} className="w-11 h-11 rounded-full object-cover border border-neutral-700" />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-black text-neutral-500 text-[15px]">
                            {(md.display_name || "M").substring(0, 1)}
                          </div>
                        )}
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-[#1C1C1E] flex items-center justify-center">
                          <ShieldCheck className="w-2.5 h-2.5 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-bold text-[14px] truncate">{md.display_name || "나이트플로우 파트너"}</p>
                          <TrustBadge tier={getDealTier(dealCount)} size="sm" />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[11px] text-neutral-500">NightFlow 인증 파트너</p>
                          {dealCount > 0 && (
                            <span className="text-[10px] font-bold text-neutral-400">
                              · 거래 {dealCount}회
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* 복사 버튼 — MD에게 보낼 메시지를 원클릭 복사 */}
                    <CopyAcceptedMessageButton puzzle={puzzle} offer={acceptedOffer} />
                    {/* puzzle.kakao_open_chat_url이 NULL(기본 케이스)일 때 MD 연락 수단 카드 노출 */}
                    {!puzzle.kakao_open_chat_url && (
                      <div className="pt-1">
                        <MDContactCard md={md as PublicUserProfile} />
                      </div>
                    )}
                    {/* 거래 확정 상태 표시 (Migration 147: leader는 알림만 받고 마킹 권한 없음) */}
                    {acceptedOffer.visit_marked_at && (
                      <div className="pt-2 border-t border-amber-500/20">
                        <span className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full bg-green-500/15 text-green-400">
                          <ShieldCheck className="w-3.5 h-3.5" /> 거래 확정됨
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}
              <p className="text-[11px] text-neutral-500">
                {isLeader
                  ? puzzle.kakao_open_chat_url
                    ? "MD가 회원님이 등록한 오픈채팅으로 입장합니다. 선입금/테이블 배정은 MD와 직접 협의하세요."
                    : "위 연락 수단 중 편한 것으로 MD에게 직접 연락해주세요. 선입금/테이블 배정은 MD와 직접 협의하세요."
                  : `MD ${offers.filter(o => o.status !== 'expired').length}명이 경쟁, 성사됨`}
              </p>

            </section>
          )}

          {/* 관리자 전용: 작성자(대표자) 정보 */}
          {isAdmin && leader && (
            <section className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <p className="text-[12px] font-bold text-blue-400">작성자 정보 (관리자 전용)</p>
              </div>
              <div className="flex items-center gap-3">
                {leader.profile_image ? (
                  <img src={leader.profile_image} alt={leader.display_name || leader.name || "leader"} className="w-11 h-11 rounded-full object-cover border border-neutral-700" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-black text-neutral-500 text-[15px]">
                    {(leader.display_name || leader.name || "?").substring(0, 1)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <Link
                    href={leader.role === "md" ? `/admin/mds/${leader.id}` : `/admin/users?focus=${leader.id}`}
                    className="text-[14px] font-bold text-white truncate hover:text-blue-400 hover:underline transition-colors block"
                  >
                    {leader.display_name || leader.name || "이름 없음"}
                    {leader.role && leader.role !== "user" && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300 align-middle">{leader.role}</span>
                    )}
                  </Link>
                  <p className="text-[11px] text-neutral-500 truncate">
                    {leader.name && leader.display_name && leader.name !== leader.display_name ? `본명: ${leader.name} · ` : ""}
                    ID: {leader.id.substring(0, 8)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-[#1C1C1E] rounded-lg px-3 py-2">
                  <p className="text-neutral-500">전화</p>
                  <p className="text-white font-mono">{leader.phone || "-"}</p>
                </div>
                <div className="bg-[#1C1C1E] rounded-lg px-3 py-2">
                  <p className="text-neutral-500">인스타</p>
                  <p className="text-white font-mono truncate">{leader.instagram || "-"}</p>
                </div>
                <div className="bg-[#1C1C1E] rounded-lg px-3 py-2">
                  <p className="text-neutral-500">스트라이크</p>
                  <p className={`font-bold ${(leader.strike_count ?? 0) > 0 ? "text-red-400" : "text-white"}`}>
                    {leader.strike_count ?? 0}회
                  </p>
                </div>
                <div className="bg-[#1C1C1E] rounded-lg px-3 py-2">
                  <p className="text-neutral-500">상태</p>
                  <p className={`font-bold ${leader.is_blocked ? "text-red-400" : "text-green-400"}`}>
                    {leader.is_blocked ? "차단됨" : "정상"}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* 관리자 도구 */}
          {isAdmin && !["cancelled", "expired"].includes(puzzle.status) && (
            <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center justify-between">
              <div>
                <p className="text-[12px] font-bold text-red-400">관리자 도구</p>
                <p className="text-[10px] text-neutral-500">깃발 강제 종료 (참여자 알림 + MD 슬롯 회복)</p>
              </div>
              <AdminCancelPuzzleButton puzzleId={puzzle.id} />
            </section>
          )}

          {/* 오퍼 섹션 — 성사 후엔 MD(본인 오퍼 상태 확인) 전용으로 축소. 일반 유저/방장은 위 성사됨 카드로 충분. */}
          {(!isAccepted || ((isMd || isAdmin) && myOffer)) && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-neutral-400" />
                <h2 className="text-[14px] font-bold text-neutral-300">시크릿 오퍼</h2>
              </div>
              <span className="text-[11px] text-neutral-500">
                {isAccepted
                  ? "제안 마감"
                  : pendingOffers.length === 0
                  ? "아직 제안 없음"
                  : !isLeader
                  ? "방장만 모든 내용을 볼 수 있어요"
                  : ""}
              </span>
            </div>

            {/* 방장: 진행 중인(pending) 제안만 — 수락된 오퍼는 위 성사됨 카드에 이미 표시 */}
            {isLeader && !isAccepted && pendingOffers.length > 0 && (
              <div className="space-y-3">
                {pendingOffers.map((offer, idx) => (
                  <SecretOfferCard
                    key={offer.id}
                    offer={offer}
                    offerNumber={idx + 1}
                    index={idx}
                    userId={currentUserId}
                    isAdmin={isAdmin}
                    isOpen={isOpen}
                    actionLoading={actionLoading}
                    onAccept={handleAcceptOffer}
                    onReject={handleRejectOffer}
                    onWithdrawn={loadOffers}
                  />
                ))}
              </div>
            )}

            {/* 비방장: 테이블타입 공개 + 주류/extras blur 처리 */}
            {!isLeader && pendingOffers.length > 0 && !isAccepted && (
              <div className="space-y-3">
                <p className="text-[13px] text-neutral-400">
                  <span className="text-white font-bold">MD {pendingOffers.length}명</span>이 줄서있어요
                </p>
                {publicOffers.map((offer, idx) => (
                  <div
                    key={offer.id}
                    className="bg-[#1C1C1E] rounded-2xl border border-dashed border-neutral-700 p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-bold text-white">Offer #{idx + 1}</p>
                      </div>
                      <p className="text-[11px] text-neutral-500">
                        {new Date(offer.created_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                        {" "}
                        {new Date(offer.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="space-y-1.5 blur-sm select-none pointer-events-none">
                      {(offer.public.liquorCategories.length > 0 || offer.public.extras.length > 0) && (
                        <div className="flex flex-wrap gap-1">
                          {offer.public.liquorCategories.map((cat) => (
                            <span key={cat} className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                              {cat}
                            </span>
                          ))}
                          {offer.public.extras.map((ext) => (
                            <span key={ext} className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
                              {ext}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[12px] text-neutral-400 italic">"토요일 자리 확보 가능합니다"</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* MD/Admin 본인 오퍼 상태 */}
            {(isMd || isAdmin) && myOffer && (
              <div className={`rounded-2xl border p-4 space-y-2 ${
                myOffer.status === "accepted"
                  ? "bg-amber-500/10 border-amber-500/30"
                  : myOffer.status === "pending"
                  ? "bg-[#1C1C1E] border-green-500/30"
                  : "bg-[#1C1C1E] border-neutral-800"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-bold text-white">내 제안</p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    myOffer.status === "accepted"
                      ? "bg-amber-500/20 text-amber-400"
                      : myOffer.status === "pending"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-neutral-700 text-neutral-500"
                  }`}>
                    {OFFER_STATUS_LABEL[myOffer.status]}
                  </span>
                </div>
                <p className="text-[14px] font-black text-white">
                  {myOffer.proposed_price.toLocaleString()}원
                </p>
                {myOffer.includes?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {myOffer.includes.map((item: string) => (
                      <span key={item} className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400">{item}</span>
                    ))}
                  </div>
                )}
                {myOffer.comment && (
                  <p className="text-[12px] text-neutral-400 italic">"{myOffer.comment}"</p>
                )}
                {myOffer.status === "accepted" && puzzle.kakao_open_chat_url && (
                  <a
                    href={puzzle.kakao_open_chat_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-[#FEE500] text-[#3C1E1E] font-bold text-[13px] rounded-xl hover:bg-[#FDD835] transition-colors"
                  >
                    카카오 오픈채팅 입장하기
                  </a>
                )}
                {myOffer.status === "accepted" && !puzzle.kakao_open_chat_url && (
                  <p className="text-[12px] text-amber-400">방장이 회원님께 직접 연락드릴 예정입니다.</p>
                )}
                {myOffer.status === "pending" && isOpen && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => { setEditingOffer(myOffer); setShowOffer(true); }}
                      disabled={actionLoading}
                      variant="outline"
                      size="sm"
                      className="h-8 border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 font-bold text-[12px] rounded-lg"
                    >
                      수정
                    </Button>
                    <Button
                      onClick={() => handleWithdrawOffer(myOffer.id)}
                      disabled={actionLoading}
                      variant="outline"
                      size="sm"
                      className="h-8 border-neutral-700 bg-transparent text-neutral-400 hover:bg-neutral-800 font-bold text-[12px] rounded-lg"
                    >
                      <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                      제안 철회
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
          )}

          {/* 비방장·비멤버·비MD: 자기 깃발 등록 유도 CTA */}
          {!isLeader && !isMember && !isMd && (
            <Link
              href={currentUserId ? "/flags/new" : "/login?redirect=/flags/new"}
              className="flex items-center justify-center w-full h-13 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-black text-[15px] rounded-2xl transition-all"
            >
              나도 시크릿 오퍼 받기 →
            </Link>
          )}

          {/* 참여자 목록: 파티원 모집 중일 때만 */}
          {isRecruitingParty && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-neutral-400" />
              <h2 className="text-[14px] font-bold text-neutral-300">파티원</h2>
            </div>
            <div className="space-y-2">
              {members.map((member) => {
                const isMe = member.user_id === currentUserId;
                const isLeaderMember = member.user_id === puzzle.leader_id;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between bg-[#1C1C1E] rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      {isMe && member.user?.profile_image ? (
                        <img
                          src={member.user.profile_image}
                          alt="나"
                          className="w-9 h-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-neutral-700 flex items-center justify-center text-[14px] font-bold text-white">
                          {member.user?.name?.[0] || "?"}
                        </div>
                      )}
                      <div>
                        <p className="text-[14px] font-bold text-white flex items-center gap-1.5">
                          {isAdmin ? (
                            <Link
                              href={`/admin/users?focus=${member.user_id}`}
                              className="hover:text-blue-400 hover:underline transition-colors"
                            >
                              {member.user?.display_name || member.user?.name || "알 수 없음"}
                            </Link>
                          ) : (
                            <>{member.user?.display_name || member.user?.name || "알 수 없음"}</>
                          )}
                          {isLeaderMember && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                              대표자
                            </span>
                          )}
                          {isMe && !isLeaderMember && (
                            <span className="text-[10px] text-neutral-500">나</span>
                          )}
                        </p>
                        {member.guest_count > 0 && (
                          <p className="text-[11px] text-neutral-500">+{member.guest_count}명 동행</p>
                        )}
                      </div>
                    </div>
                    {isLeader && !isLeaderMember && isOpen && (
                      <button
                        onClick={() => handleRemoveMember(member.user_id)}
                        className="text-[11px] text-red-500 hover:text-red-400 font-medium"
                      >
                        자리 조정
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          )}

          {/* 대표자 전용 액션 */}
          {isLeader && isOpen && (
            <section className="space-y-2">
              <Button
                onClick={handleCancel}
                disabled={actionLoading}
                variant="outline"
                className="w-full h-12 border-red-500/50 bg-transparent text-red-400 hover:bg-red-500/10 font-bold text-[14px] rounded-2xl"
              >
                깃발 내리기
              </Button>
            </section>
          )}

          {/* 참여자 나가기 버튼 */}
          {isMember && (isOpen || isFull) && (
            <Button
              onClick={handleLeave}
              disabled={actionLoading}
              variant="outline"
              className="w-full h-12 border-neutral-700 bg-transparent text-neutral-400 hover:bg-neutral-800 font-bold text-[14px] rounded-2xl"
            >
              나가기
            </Button>
          )}

          {/* 미참여 유저 파티 합류 버튼: 파티원 모집 ON 일 때만 */}
          {!isMember && !isLeader && !isMd && isOpen && currentUserId && isRecruitingParty && (
            <Button
              onClick={() => setShowJoin(true)}
              className="w-full h-13 bg-white hover:bg-neutral-200 text-black font-black text-[15px] rounded-2xl transition-all active:scale-[0.98]"
            >
              파티원 합류하기
            </Button>
          )}

          {/* MD/Admin 제안하기 버튼 */}
          {(isMd || isAdmin) && isOpen && !myOffer && (
            <div className="space-y-2">
              <Button
                onClick={() => setShowOffer(true)}
                className="w-full h-13 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-2xl"
              >
                제안하기
              </Button>
              <p className="text-[11px] text-neutral-600 text-center leading-relaxed">
                수락 시 30크레딧 차감 · 미선택 시 크레딧 차감 없음
              </p>
            </div>
          )}

          {/* MD/Admin 이미 제안한 경우 */}
          {(isMd || isAdmin) && isOpen && myOffer && myOffer.status === "pending" && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
              <p className="text-[13px] text-green-400 font-bold">제안서를 보냈습니다</p>
              <p className="text-[12px] text-neutral-500 mt-1">방장의 수락을 기다리고 있습니다</p>
            </div>
          )}

          {/* 로그인 유도: 파티원 모집 ON 일 때만 */}
          {!currentUserId && isOpen && isRecruitingParty && (
            <Link href="/login">
              <Button className="w-full h-12 bg-white text-black font-black text-[14px] rounded-2xl">
                로그인하고 파티원 합류하기
              </Button>
            </Link>
          )}
        </div>
      </div>

      {showJoin && (
        <PuzzleJoinSheet
          puzzle={puzzle}
          open={showJoin}
          onClose={() => setShowJoin(false)}
        />
      )}

      {showOffer && (
        <OfferSheet
          puzzle={puzzle}
          open={showOffer}
          editingOffer={editingOffer}
          onClose={() => { setShowOffer(false); setEditingOffer(null); }}
          onSubmitted={() => {
            setShowOffer(false);
            setEditingOffer(null);
            loadOffers();
          }}
        />
      )}

      <OfferAcceptSheet
        open={showAcceptSheet}
        md={acceptingMd}
        puzzle={puzzle}
        offer={offers.find((o) => o.id === pendingAcceptOfferId) ?? null}
        onClose={() => {
          setShowAcceptSheet(false);
          setPendingAcceptOfferId(null);
          setAcceptingMd(null);
        }}
        onAccept={handleAcceptConfirm}
      />

      <LeaderInfoSheet
        open={showLeaderInfo}
        onOpenChange={setShowLeaderInfo}
        leader={puzzle.leader ?? null}
      />

      <ConfirmDialog
        isOpen={showKakaoNotice}
        onOpenChange={setShowKakaoNotice}
        onConfirm={handleKakaoNoticeRegister}
        onCancel={handleKakaoNoticeSkip}
        title="오픈채팅으로 받고 싶다면?"
        description="개인정보 공개를 원치 않으신다면 오픈채팅을 등록해보세요. 등록 후 MD에게 전화번호 대신 오픈채팅 링크가 전달됩니다."
        confirmText="오픈채팅 등록"
        cancelText="그냥 수락하기"
        variant="default"
      />
    </div>
  );
}
