"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Users, CheckCircle2, Undo2, Building2, Share2, ShieldCheck, Pencil, User, Eye, MessageCircle } from "lucide-react";
import { FeatureGate } from "@/components/common/FeatureGate";
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
import { PuzzleCancelConfirmSheet } from "./PuzzleCancelConfirmSheet";
import { SecretOfferCard } from "./SecretOfferCard";
import { PuzzlePiece, buildPuzzleSlotLayout } from "./PuzzleCard";
import type { Puzzle, PuzzleMember, PuzzleOffer, GenderPref, AgePref, VibePref, PublicUserProfile, PuzzleCancelReason } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";
import { getPublicIncludes } from "@/lib/utils/liquor";
import { toEnglishInclude } from "@/lib/utils/liquorEn";
import { getLang, makeT, areaLabel } from "@/lib/i18n";
import { OfferCommentText } from "./OfferCommentText";
import { useTranslatedText } from "@/hooks/useTranslatedComment";
import { TrustBadge } from "@/components/ui/TrustBadge";
import { getDealTier, isNewUser } from "@/lib/utils/dealTier";
import { formatRelativeTime, getDDayLabel } from "@/lib/utils/format";
import { useCountdown } from "@/hooks/useCountdown";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";
import "dayjs/locale/en";

dayjs.extend(relativeTime);
dayjs.locale("ko");
import { normalizeProfileImage } from "@/lib/utils/image";
import { LeaderInfoSheet } from "./LeaderInfoSheet";
import { ContentMoreMenu } from "@/components/moderation/ContentMoreMenu";
import { RecentMatchShowcaseSheet, useRecentMatchedPuzzle } from "./RecentMatchShowcaseSheet";

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
  last_sign_in_at: string | null;
  last_seen_at?: string | null;
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
  early_30s: "30초",
  mid_30s: "30중",
  any: null,
};
const VIBE_LABEL: Record<VibePref, string | null> = {
  chill: "조용히",
  active: "신나게",
  any: null,
};

function formatEventDate(dateStr: string, en = false) {
  const d = new Date(dateStr + "T00:00:00");
  if (en) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
  }
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}월 ${day}일 (${days[d.getDay()]})`;
}


const STATUS_LABEL: Record<string, string> = {
  open: "제안 받는중",
  selecting: "검토 중",
  matched: "마감",
  accepted: "성사됨",
  cancelled: "취소됨",
  expired: "만료됨",
};
const STATUS_LABEL_EN: Record<string, string> = {
  open: "Receiving offers",
  selecting: "Reviewing",
  matched: "Closed",
  accepted: "Matched",
  cancelled: "Cancelled",
  expired: "Expired",
};

function SelectingBanner({ expiresAt, en }: { expiresAt: string; en?: boolean }) {
  const { remaining, level } = useCountdown(expiresAt);
  const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");
  const timerCls = level === "critical" ? "text-red-400" : level === "warning" ? "text-amber-300" : "text-white";
  return (
    <section className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-1">
      <p className="text-[14px] font-bold text-amber-400">{en ? "⏰ Offers have closed" : "⏰ 오퍼가 종료되었습니다"}</p>
      <p className="text-[12px] text-neutral-300">
        {en ? "You have " : ""}
        <span className={`font-mono font-bold ${timerCls}`}>{mm}:{ss}</span>
        {en ? " left to decide" : " 동안 더 고민할 수 있어요"}
      </p>
    </section>
  );
}

const OFFER_STATUS_LABEL: Record<string, string> = {
  pending: "제안 중",
  accepted: "수락됨",
  rejected: "거절됨",
  withdrawn: "철회됨",
  expired: "미선택",
};
const OFFER_STATUS_LABEL_EN: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  expired: "Not selected",
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

  const lang = getLang(searchParams.get("lang"));
  const isForeigner = lang !== "ko";
  const t = makeT(lang);

  // 깃발 notes를 보는 사람 언어로 번역 (작성자 언어 != 보는 언어일 때).
  // 한국 MD ← 외국어 깃발 = 한국어로 / 외국인 ← 한국어 깃발 = 모국어로. (양방향, 캐시)
  const notesAuthorLang = (puzzle.leader as { lang?: string } | null | undefined)?.lang ?? "ko";
  const notesTr = useTranslatedText(puzzle.notes, lang, notesAuthorLang !== lang);
  const displayNotes = notesTr ?? puzzle.notes;
  const lq = isForeigner ? "?lang=en" : "";
  // 외국인 모드에서 상대시간(fromNow)·요일을 영어로
  useEffect(() => {
    dayjs.locale(isForeigner ? "en" : "ko");
  }, [isForeigner]);

  useEffect(() => {
    if (searchParams.get("edit_blocked") === "offers") {
      toast.error(t("MD 제안이 들어온 깃발은 수정할 수 없어요", "Requests with offers can't be edited"));
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
  const [showCancelSheet, setShowCancelSheet] = useState(false);
  const [showMatchedShowcase, setShowMatchedShowcase] = useState(false);
  const recentMatchedPuzzle = useRecentMatchedPuzzle();

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/flags/${puzzle.id}${lq}`;
    const totalBudget =
      puzzle.total_budget ?? puzzle.budget_per_person * puzzle.target_count;
    const title = isForeigner ? `NightFlow Request · ${areaLabel(puzzle.area, lang)}` : `나플 깃발 · ${puzzle.area}`;
    const text = isForeigner
      ? `${areaLabel(puzzle.area, lang)} · ₩${totalBudget.toLocaleString()} · ${puzzle.target_count} ppl`
      : `${puzzle.area} · 총 ${Math.round(totalBudget / 10000)}만원 · ${puzzle.target_count}명`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // 사용자가 취소한 경우 무시
      }
      return;
    }

    // navigator.clipboard는 보안 컨텍스트(HTTPS/localhost)에서만 존재
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // 폴백: 임시 textarea + execCommand
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success(t("링크가 복사되었습니다", "Link copied"));
    } catch {
      toast.error(t("링크 복사에 실패했습니다", "Failed to copy link"));
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
  // Migration 297: 오퍼 마감 후 'selecting' 단계에서도 방장은 60분간 수락 가능.
  // isOpen 은 신규 오퍼 제출/join 같은 동작용이라 selecting 을 포함하면 안 됨.
  const canAcceptOffers =
    (puzzle.status === "open" || puzzle.status === "selecting") && !isFull;
  const isAccepted = puzzle.status === "accepted";
  // 하위 호환: V1 퍼즐은 budget_per_person, V2는 total_budget 사용
  const baseBudget = puzzle.total_budget ?? (puzzle.budget_per_person * puzzle.target_count);
  const perPersonBudget = puzzle.total_budget
    ? Math.floor(puzzle.total_budget / puzzle.target_count)
    : puzzle.budget_per_person;
  const fillRate = Math.round((puzzle.current_count / puzzle.target_count) * 100);

  const genderTag = GENDER_LABEL[puzzle.gender_pref];
  // Migration 171: age_pref가 배열. 'any' 포함 시 null, 외엔 라벨 조합 ("20초·20후")
  const ageTag = puzzle.age_pref.includes("any")
    ? null
    : puzzle.age_pref.map((a) => AGE_LABEL[a]).filter(Boolean).join("·") || null;
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

    // 3단계: 어드민은 모든 오퍼의 MD 식별 정보 조회 (모니터링/조정용).
    if (isAdmin) {
      const { data: adminMdData } = await supabase
        .from("puzzle_offers")
        .select("id, md:public_user_profiles!puzzle_offers_md_id_fkey(id, display_name, profile_image, md_deal_count, instagram, phone, kakao_open_chat_url, preferred_contact_methods)")
        .eq("puzzle_id", puzzle.id)
        .in("status", ["pending", "accepted"]);

      if (adminMdData) {
        const mdByOfferId = new Map(
          adminMdData.map((row) => [row.id, row.md as unknown as PuzzleOffer["md"]]),
        );
        merged = merged.map((o) => {
          const md = mdByOfferId.get(o.id);
          return md ? ({ ...o, md } as PuzzleOffer) : o;
        });
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

  // 비방장용: 본인 오퍼 제외 + public 변환
  // 클럽명은 1개만 공개(맛보기). 나머지는 클럽명 숨김.
  const { publicOffers, hiddenOffers } = useMemo(() => {
    const seenClubs = new Set<string>();
    const publicResult: Array<PuzzleOffer & { public: ReturnType<typeof getPublicIncludes> }> = [];
    const hiddenResult: Array<PuzzleOffer & { public: ReturnType<typeof getPublicIncludes> }> = [];
    for (const o of pendingOffers) {
      if (o.md_id === currentUserId) continue;
      const enriched = { ...o, public: getPublicIncludes(o.includes) };
      const clubKey = o.club?.id ?? `no-club-${o.id}`;
      if (publicResult.length < 1 && !seenClubs.has(clubKey)) {
        seenClubs.add(clubKey);
        publicResult.push(enriched);
      } else {
        hiddenResult.push(enriched);
      }
    }
    return { publicOffers: publicResult, hiddenOffers: hiddenResult };
  }, [pendingOffers, currentUserId]);

  // 방장 자가 취소: 사유 입력 시트 오픈 (사전 마찰)
  const handleCancel = () => {
    setShowCancelSheet(true);
  };

  const handleCancelWithReason = async (
    reasons: PuzzleCancelReason[],
    reasonText: string | null
  ) => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("cancel_puzzle_with_reason", {
        p_puzzle_id: puzzle.id,
        p_reasons: reasons,
        p_reason_text: reasonText,
      });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || t("취소에 실패했습니다", "Failed to cancel")); return; }
      setShowCancelSheet(false);
      toast.success(t("깃발을 내렸습니다", "Request taken down"));
      router.push(isForeigner ? "/en" : "/?tab=puzzle");
    } catch {
      toast.error(t("취소에 실패했습니다", "Failed to cancel"));
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
        toast.error(data?.error || t("수락에 실패했습니다", "Failed to accept"));
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
      toast.error(t("수락에 실패했습니다", "Failed to accept"));
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
          <Link href={isForeigner ? "/en" : "/?tab=puzzle"} className="text-white">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-[17px] font-black text-white flex-1">{t("깃발 상세", "Request detail")}</h1>
          {currentUserId === puzzle.leader_id && isOpen && pendingOffers.length === 0 && (
            <Link
              href={`/flags/${puzzle.id}/edit${lq}`}
              aria-label={t("깃발 수정", "Edit request")}
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
                  : puzzle.status === "selecting"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : puzzle.status === "accepted"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : puzzle.status === "matched"
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-neutral-700 text-neutral-400"
              }`}
            >
              {(isForeigner ? STATUS_LABEL_EN : STATUS_LABEL)[puzzle.status] || puzzle.status}
            </span>
          )}
        </div>

        <div className="space-y-5 pb-10">
          {/* 검토 중 배너 (status = selecting) */}
          {puzzle.status === "selecting" && (
            <SelectingBanner expiresAt={puzzle.expires_at} en={isForeigner} />
          )}

          {/* 취소 안내 배너 (status = cancelled) */}
          {puzzle.status === "cancelled" && (
            <section
              role="alert"
              className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-black text-red-300">{t("🚩 취소된 깃발입니다", "🚩 This request was cancelled")}</span>
              </div>
              {puzzle.cancelled_reason ? (
                <>
                  <p className="text-[12px] text-red-200/70 font-bold uppercase tracking-wide">
                    {t("관리자 안내 사유", "Reason from admin")}
                  </p>
                  <p className="text-[14px] text-white leading-relaxed whitespace-pre-wrap break-keep">
                    {puzzle.cancelled_reason}
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-neutral-300 leading-relaxed">
                  {t("이 깃발은 더 이상 진행되지 않습니다. 새로운 깃발을 등록해 주세요.", "This request is no longer active. Please make a new one.")}
                </p>
              )}
              {puzzle.cancelled_at && (
                <p className="text-[11px] text-neutral-500">
                  {new Date(puzzle.cancelled_at).toLocaleString(isForeigner ? "en-US" : "ko-KR", {
                    timeZone: "Asia/Seoul",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{t(" 취소됨", " cancelled")}
                </p>
              )}
            </section>
          )}

          {/* 날짜 헤더 — 상세에서는 한 단계 크게(22px) 위계 강화 */}
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-1.5 h-[20px] bg-amber-500 rounded-full flex-shrink-0" />
            <h3 className="text-[22px] font-black text-white tracking-tight">
              {formatEventDate(puzzle.event_date, isForeigner)}
            </h3>
            {(() => {
              const dday = getDDayLabel(puzzle.event_date);
              const isToday = dday === "오늘";
              return (
                <span
                  className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full ${
                    isToday
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {isToday ? t("오늘", "Today") : dday}
                </span>
              );
            })()}
          </div>

          {/* 기본 정보 */}
          <section className="bg-[#1C1C1E] rounded-2xl px-5 pt-4 pb-3 space-y-2.5">
            {/* 제목 + 지역 (맨 위) — 우측에 공유 버튼 */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-x-2 min-w-0">
                {puzzle.notes && (
                  <p className="text-[22px] font-black text-white leading-snug tracking-tight break-keep">{displayNotes}</p>
                )}
                <span className="text-[14px] text-neutral-400">{areaLabel(puzzle.area, lang)}</span>
              </div>
              <button onClick={handleShare} className="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-white transition-colors -mr-1 shrink-0">
                <Share2 className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* 예산 + 인원 pill + 닉네임 버튼 + 신뢰도 */}
            <div className="space-y-0.5">
              {isRecruitingParty ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[19px] font-bold text-green-400">
                      현재 {(perPersonBudget * puzzle.current_count).toLocaleString()}원
                    </span>
                    <span className="text-[13px] text-neutral-500">
                      / 목표 {baseBudget.toLocaleString()}원
                    </span>
                    {puzzle.leader && (
                      <button
                        type="button"
                        onClick={() => setShowLeaderInfo(true)}
                        className="inline-flex items-center gap-1.5 text-[12px] text-neutral-300 font-bold hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-full px-2.5 py-1 transition-colors"
                      >
                        {puzzle.leader.profile_image ? (
                          <img src={puzzle.leader.profile_image} alt="" decoding="async" className="w-4 h-4 rounded-full object-cover" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-neutral-700 flex items-center justify-center text-[9px] font-black">
                            {(puzzle.leader.display_name || puzzle.leader.name || "?").substring(0, 1)}
                          </div>
                        )}
                        {puzzle.leader.display_name || puzzle.leader.name || "방장"}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* 홈 카드 패턴 통일: 예산 + 인원 pill + 닉네임 버튼 + 음악 한 줄 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[19px] font-bold text-green-400">
                      {isForeigner ? `₩${baseBudget.toLocaleString()}` : `예산 ${baseBudget.toLocaleString()}원`}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[12px] font-bold">
                      {puzzle.target_count}{t("명", " ppl")}
                    </span>
                    {puzzle.leader && (
                      <button
                        type="button"
                        onClick={() => setShowLeaderInfo(true)}
                        className="inline-flex items-center gap-1.5 text-[12px] text-neutral-300 font-bold hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-full px-2.5 py-1 transition-colors"
                      >
                        {puzzle.leader.profile_image ? (
                          <img src={puzzle.leader.profile_image} alt="" decoding="async" className="w-4 h-4 rounded-full object-cover" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-neutral-700 flex items-center justify-center text-[9px] font-black">
                            {(puzzle.leader.display_name || puzzle.leader.name || "?").substring(0, 1)}
                          </div>
                        )}
                        {puzzle.leader.display_name || puzzle.leader.name || t("방장", "Host")}
                      </button>
                    )}
                    {(puzzle.music_preference === "hiphop" || puzzle.music_preference === "edm") && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 text-[11px] font-medium">
                        {puzzle.music_preference === "hiphop" ? t("힙합", "Hip-hop") : "EDM"}{t(" 선호", " preferred")}
                      </span>
                    )}
                  </div>
                  {/* 신뢰도 메타 — 닉네임 버튼 아래 줄 */}
                  {puzzle.leader && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1.5">
                      {(() => {
                        const tier = getDealTier(puzzle.leader.deal_amount_total ?? 0);
                        const leaderIsNew = isNewUser(puzzle.leader.created_at);
                        return <TrustBadge tier={tier} isNew={leaderIsNew} size="sm" showLabel />;
                      })()}
                      {(() => {
                        const dealCount = puzzle.leader.deal_count_total ?? 0;
                        return dealCount > 0 ? (
                          <span className="text-[11px] text-neutral-500 font-bold">{isForeigner ? `${dealCount} deals` : `거래 ${dealCount}회`}</span>
                        ) : null;
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 인원 퍼즐 조각: 파티원 모집 중일 때만 표시 */}
            {isRecruitingParty && (
              <div className="space-y-1.5">
                <span className="text-[13px] text-neutral-400">
                  {puzzle.current_count >= puzzle.target_count
                    ? "퍼즐 완성!"
                    : `파티원 ${puzzle.current_count}/${puzzle.target_count}명 (🧑 ${puzzle.current_male ?? 0}/${puzzle.target_male ?? 0} · 👩 ${puzzle.current_female ?? 0}/${puzzle.target_female ?? 0})`}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {buildPuzzleSlotLayout(puzzle).map((slot, i) => (
                    <PuzzlePiece
                      key={i}
                      filled={slot.filled}
                      isLeader={slot.isLeader}
                      gender={slot.gender}
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
            <p
              className="text-[11px] text-neutral-600 text-right -mt-1"
              suppressHydrationWarning
            >
              {formatRelativeTime(puzzle.created_at)}
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
              {t("카카오 오픈채팅 입장하기", "Open KakaoTalk chat")}
            </a>
          )}

          {/* 성사 기록 (accepted 상태) */}
          {isAccepted && (
            <section className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-amber-400" />
                <h2 className="text-[15px] font-black text-amber-400">{t("성사됨", "Matched")}</h2>
              </div>
              {acceptedOffer && (
                <div className="space-y-1">
                  <p className="text-[14px] font-bold text-white">
                    {(acceptedOffer.club as { name?: string } | null)?.name || t("클럽", "Club")}
                  </p>
                  {/* 방장에게만 상세 정보 표시 */}
                  {isLeader && (
                    <div className="space-y-2 pt-2 border-t border-amber-500/20 mt-2">
                      <p className="text-[13px] text-neutral-300">
                        💰 {isForeigner ? `₩${acceptedOffer.proposed_price.toLocaleString()}` : `${acceptedOffer.proposed_price.toLocaleString()}원`}
                      </p>
                      {acceptedOffer.includes.length > 0 && (
                        <div className="flex flex-wrap gap-1 w-full">
                          {acceptedOffer.includes.map((inc) => (
                            <span key={inc} className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 break-words max-w-full">
                              {isForeigner ? toEnglishInclude(inc) : inc}
                            </span>
                          ))}
                        </div>
                      )}
                      {acceptedOffer.comment && (
                        <OfferCommentText comment={acceptedOffer.comment} lang={lang} />
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
                        <div className="relative w-11 h-11 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden">
                          <span className="absolute inset-0 flex items-center justify-center font-black text-neutral-500 text-[15px]">
                            {(md.display_name || "M").substring(0, 1)}
                          </span>
                          {md.profile_image && (
                            <img
                              src={normalizeProfileImage(md.profile_image)!}
                              alt={md.display_name || "MD"}
                              decoding="async"
                              className="relative w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          )}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-[#1C1C1E] flex items-center justify-center">
                          <ShieldCheck className="w-2.5 h-2.5 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-bold text-[14px] truncate">{md.display_name || t("나이트플로우 파트너", "NightFlow Partner")}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[11px] text-neutral-500">{t("NightFlow 인증 파트너", "NightFlow verified partner")}</p>
                          {dealCount > 0 && (
                            <span className="text-[10px] font-bold text-neutral-400">
                              {isForeigner ? `· ${dealCount} deals` : `· 거래 ${dealCount}회`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* 복사 버튼 — MD에게 보낼 메시지를 원클릭 복사 */}
                    <CopyAcceptedMessageButton puzzle={puzzle} offer={acceptedOffer} lang={lang} />
                    {/* puzzle.kakao_open_chat_url이 NULL(기본 케이스)일 때 MD 연락 수단 카드 노출 */}
                    {!puzzle.kakao_open_chat_url && (
                      <div className="pt-1">
                        <MDContactCard md={md as PublicUserProfile} lang={lang} />
                      </div>
                    )}
                    {/* 거래 확정 상태 표시 (Migration 147: leader는 알림만 받고 마킹 권한 없음) */}
                    {acceptedOffer.visit_marked_at && (
                      <div className="pt-2 border-t border-amber-500/20">
                        <span className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full bg-green-500/15 text-green-400">
                          <ShieldCheck className="w-3.5 h-3.5" /> {t("거래 확정됨", "Visit confirmed")}
                        </span>
                      </div>
                    )}
                    {/* 리뷰 작성 안내 — 이벤트 다음날부터 노출 (방장 본인만) */}
                    {isLeader && (() => {
                      const eventDayEnd = new Date(puzzle.event_date + "T00:00:00");
                      eventDayEnd.setDate(eventDayEnd.getDate() + 1);
                      const showReviewPrompt = new Date() >= eventDayEnd;
                      if (!showReviewPrompt) return null;
                      return (
                        <div className="pt-3 border-t border-amber-500/20 space-y-2">
                          <p className="text-[13px] font-bold text-white text-center">
                            {isForeigner
                              ? `How was ${(acceptedOffer.club as { name?: string } | null)?.name || "the club"} last night?`
                              : `어제 ${(acceptedOffer.club as { name?: string } | null)?.name || "클럽"} 어떠셨어요?`}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => toast.success(t("기록되었어요", "Recorded"))}
                              className="flex-1 h-11 rounded-2xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 font-bold text-[13px] transition"
                            >
                              {t("가지 않았어요", "Didn't go")}
                            </button>
                            <Link
                              href={`/flags/${puzzle.id}/review${lq}`}
                              className="flex-1 inline-flex items-center justify-center h-11 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-black text-[13.5px] transition-all"
                            >
                              {t("⭐ 리뷰 쓰기", "⭐ Write a review")}
                            </Link>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
              <p className="text-[11px] text-neutral-500">
                {isLeader
                  ? puzzle.kakao_open_chat_url
                    ? t(
                        "MD가 회원님이 등록한 오픈채팅으로 입장합니다. 선입금/테이블 배정은 MD와 직접 협의하세요.",
                        "The club host will join your open chat. Arrange any deposit and table directly with them."
                      )
                    : t(
                        "위 연락 수단 중 편한 것으로 MD에게 직접 연락해주세요. 선입금/테이블 배정은 MD와 직접 협의하세요.",
                        "Contact the club host directly via one of the methods above. Arrange any deposit and table directly with them."
                      )
                  : isForeigner
                    ? `${offers.filter(o => o.status !== 'expired').length} clubs competed — matched`
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
                <div className="relative w-11 h-11 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden">
                  <span className="absolute inset-0 flex items-center justify-center font-black text-neutral-500 text-[15px]">
                    {(leader.display_name || leader.name || "?").substring(0, 1)}
                  </span>
                  {leader.profile_image && (
                    <img
                      src={normalizeProfileImage(leader.profile_image)!}
                      alt={leader.display_name || leader.name || "leader"}
                      decoding="async"
                      className="relative w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                </div>
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
                <div className="bg-[#1C1C1E] rounded-lg px-3 py-2 col-span-2">
                  <p className="text-neutral-500">마지막 접속</p>
                  <p className="text-white font-mono">
                    {leader.last_seen_at
                      ? `${dayjs(leader.last_seen_at).format("YYYY-MM-DD HH:mm")} (${dayjs(leader.last_seen_at).fromNow()})`
                      : "-"}
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
                <span className="text-[16px] leading-none">💌</span>
                <h2 className="text-[16px] font-bold text-neutral-200">
                  {t("시크릿오퍼", "Secret Offers")}
                  {pendingOffers.length > 0 && !isAccepted && (
                    <span className="ml-1.5 text-white">{pendingOffers.length}{t("건", "")}</span>
                  )}
                </h2>
              </div>
              {puzzle.status === "open" ? (
                <span className="text-[12px] text-neutral-400 whitespace-nowrap">
                  {isForeigner
                    ? `⏰ Offers close at ${puzzle.offer_deadline ? dayjs(puzzle.offer_deadline).format("h A") : "5 PM"} today`
                    : `⏰ 당일 ${puzzle.offer_deadline ? dayjs(puzzle.offer_deadline).format("h시") : "5시"} 오퍼 마감`}
                </span>
              ) : (
                (isAccepted || pendingOffers.length === 0) && (
                  <span className="text-[11px] text-neutral-500">
                    {isAccepted ? t("제안 마감", "Offers closed") : t("아직 제안 없음", "No offers yet")}
                  </span>
                )
              )}
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
                    isOpen={canAcceptOffers}
                    actionLoading={actionLoading}
                    onAccept={handleAcceptOffer}
                    onReject={handleRejectOffer}
                    onWithdrawn={loadOffers}
                    onAdminEdit={isAdmin ? (o) => { setEditingOffer(o); setShowOffer(true); } : undefined}
                    lang={lang}
                  />
                ))}
              </div>
            )}

            {/* 비방장: 테이블타입 공개 + 주류/extras blur 처리 */}
            {!isLeader && pendingOffers.length > 0 && !isAccepted && (
              <div className="space-y-3 -mt-2">
                <p className="text-[13px] text-neutral-400 font-medium">
                  {t("오퍼는 작성자만 볼 수 있어요✨", "Offers are visible to the author only✨")}
                </p>
                {publicOffers.map((offer, idx) => (
                  <div
                    key={offer.id}
                    className="bg-[#1C1C1E] rounded-2xl border border-dashed border-neutral-700 p-4 space-y-2"
                  >
                    <div>
                      <p className="text-[14px] font-bold text-amber-300">Offer #{idx + 1}</p>
                      {offer.club?.name ? (
                        <span className="inline-block text-[18px] font-black text-white -mt-0.5 blur-sm select-none pointer-events-none">
                          {offer.club.name}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1.5 blur-sm select-none pointer-events-none">
                      {offer.public.liquorCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {offer.public.liquorCategories.map((cat) => (
                            <span
                              key={cat}
                              className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            >
                              🍾 {isForeigner ? toEnglishInclude(cat) : cat}
                            </span>
                          ))}
                        </div>
                      )}
                      {offer.public.extras.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {offer.public.extras.map((ext) => (
                            <span
                              key={ext}
                              className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-neutral-900 text-neutral-500 border border-neutral-800"
                            >
                              {isForeigner ? toEnglishInclude(ext) : ext}
                            </span>
                          ))}
                        </div>
                      )}
                      {offer.comment && (
                        <OfferCommentText comment={offer.comment} lang={lang} />
                      )}
                    </div>
                  </div>
                ))}
                {hiddenOffers.map((offer, i) => (
                  <div
                    key={offer.id}
                    className="bg-[#1C1C1E] rounded-2xl border border-dashed border-neutral-700 p-4 space-y-2"
                  >
                    <p className="text-[14px] font-bold text-amber-300">
                      Offer #{publicOffers.length + i + 1}
                    </p>
                    <div className="space-y-1.5 blur-sm select-none pointer-events-none">
                      {offer.public.liquorCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {offer.public.liquorCategories.map((cat) => (
                            <span
                              key={cat}
                              className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            >
                              🍾 {isForeigner ? toEnglishInclude(cat) : cat}
                            </span>
                          ))}
                        </div>
                      )}
                      {offer.public.extras.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {offer.public.extras.map((ext) => (
                            <span
                              key={ext}
                              className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-neutral-900 text-neutral-500 border border-neutral-800"
                            >
                              {isForeigner ? toEnglishInclude(ext) : ext}
                            </span>
                          ))}
                        </div>
                      )}
                      {offer.comment && (
                        <OfferCommentText comment={offer.comment} lang={lang} />
                      )}
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
                  <div className="flex flex-wrap gap-1.5 w-full">
                    {myOffer.includes.map((item: string) => (
                      <span key={item} className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 break-words max-w-full">{item}</span>
                    ))}
                  </div>
                )}
                {myOffer.comment && (
                  <p className="text-[12px] text-neutral-400 italic">"{myOffer.comment}"</p>
                )}
                {/* Migration 332: 방장과 1:1 대화 (방장이 먼저 말 걸면 답장 가능, 첫 답장 15크레딧) */}
                {(myOffer.status === "pending" || myOffer.status === "accepted") && (
                  <FeatureGate flag="offer_chat">
                    <Link
                      href={`/messages/${myOffer.id}`}
                      className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl border border-neutral-700 bg-transparent text-neutral-200 hover:bg-neutral-800 font-bold text-[13px]"
                    >
                      <MessageCircle className="w-4 h-4" />
                      방장과 대화
                    </Link>
                  </FeatureGate>
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
            <div className="text-center space-y-1">
              {pendingOffers.length > 0 && !isAccepted && (
                <button
                  type="button"
                  onClick={() => setShowMatchedShowcase(true)}
                  className="block w-full mb-2 text-center text-[13px] font-bold text-white hover:text-neutral-300 active:opacity-70 transition-colors"
                >
                  {t("어떤 오퍼 받았는지 구경하기 👈", "See what offers came in 👈")}
                </button>
              )}
              <Link
                href={currentUserId ? `/flags/new${lq}` : `/login?redirect=/flags/new${isForeigner ? "&lang=en" : ""}`}
                className="flex items-center justify-center w-full h-13 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-black text-[15px] rounded-2xl transition-all"
              >
                {t("⛳ 나도 오퍼받기", "⛳ Get offers too")}
              </Link>
              <p className="text-[10px] text-neutral-500">
                {t("무료", "Free")}
              </p>
            </div>
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
                          decoding="async"
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
                {t("깃발 내리기", "Take down request")}
              </Button>
            </section>
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

          {/* 신고·차단 통합 메뉴 (Apple Guideline 1.2) */}
          {currentUserId && currentUserId !== puzzle.leader_id && puzzle.leader_id && (
            <div className="pt-4">
              <ContentMoreMenu
                contentType="puzzle"
                contentId={puzzle.id}
                targetUserId={puzzle.leader_id}
                targetDisplayName={
                  puzzle.leader?.display_name || puzzle.leader?.name || "방장"
                }
              />
            </div>
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
        lang={lang}
      />

      <LeaderInfoSheet
        open={showLeaderInfo}
        onOpenChange={setShowLeaderInfo}
        leader={puzzle.leader ?? null}
      />

      <RecentMatchShowcaseSheet
        open={showMatchedShowcase}
        onOpenChange={setShowMatchedShowcase}
        recentMatchedPuzzle={recentMatchedPuzzle}
        ctaHref={currentUserId ? "/flags/new" : "/login?redirect=/flags/new"}
      />

      <PuzzleCancelConfirmSheet
        open={showCancelSheet}
        onOpenChange={setShowCancelSheet}
        submitting={actionLoading}
        onConfirm={handleCancelWithReason}
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
