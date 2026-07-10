"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Users, CheckCircle2, Undo2, Building2, Share2, ShieldCheck, Pencil, User, Eye, MessageCircle, MapPin, ChevronDown, Instagram } from "lucide-react";
import { TableDetailsCard } from "@/components/auctions/TableDetailsCard";
import { FloorPlanViewer } from "@/components/auctions/FloorPlanViewer";
import { FeatureGate } from "@/components/common/FeatureGate";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { PuzzleJoinSheet } from "./PuzzleJoinSheet";
import { OfferSheet } from "./OfferSheet";
import { OfferAcceptSheet } from "./OfferAcceptSheet";
import { MDContactCard } from "./MDContactCard";
import { CopyAcceptedMessageButton } from "./CopyAcceptedMessageButton";
import { AdminCancelPuzzleButton } from "@/components/admin/AdminCancelPuzzleButton";
import { PuzzleCancelConfirmSheet } from "./PuzzleCancelConfirmSheet";
import { SecretOfferCard } from "./SecretOfferCard";
import { ShareCreatedSheet } from "./ShareCreatedSheet";
import { PuzzlePiece, buildPuzzleSlotLayout } from "./PuzzleCard";
import type { Puzzle, PuzzleMember, PuzzleOffer, OfferChatMeta, GenderPref, AgePref, VibePref, PublicUserProfile, PuzzleCancelReason } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";
import { getPublicIncludes } from "@/lib/utils/liquor";
import { toEnglishInclude } from "@/lib/utils/liquorEn";
import { LIQUOR_KEYWORDS } from "@/lib/constants/liquor";
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
import { shareViaNative } from "@/lib/native/nativeShare";

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
  alimtalk_consent?: boolean | null;
  alimtalk_consent_at?: string | null;
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
  "20s": "20대",
  "30s": "30대",
  early_20s: "20초",
  late_20s: "20후",
  early_30s: "30초",
  mid_30s: "30중",
  any: null,
};
const VIBE_LABEL: Record<VibePref, string | null> = {
  chill: "내향인",
  active: "외향인",
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
  accepted: "매치됨",
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

// 목적격 조사 을/를 (한글 받침 기준, 영문·숫자 등은 '를')
function objParticle(name: string): string {
  const last = name.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? "를" : "을";
  return "를";
}

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

  // 조각 상세 진입 트래킹 — 공유 링크는 ?t=<ms> 캐시버스터가 붙어서 옴 (ShareCreatedSheet).
  // from_share_link=true 이벤트 수 = MD/유저 공유가 실제로 열람된 횟수.
  // referrer/utm은 events.ts에서 자동 부착.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    trackEvent("puzzle_detail_view", {
      puzzle_id: puzzle.id,
      host_is_md: puzzle.host_is_md,
      area: puzzle.area,
      from_share_link: !!t,
      share_bust: t,
    });
  }, [puzzle.id, puzzle.host_is_md, puzzle.area]);

  useEffect(() => {
    if (searchParams.get("edit_blocked") === "offers") {
      toast.error(t(isRecruitingParty ? "파트너 제안이 들어온 조각은 수정할 수 없어요" : "파트너 제안이 들어온 깃발은 수정할 수 없어요", "Requests with offers can't be edited"));
      router.replace(`/flags/${puzzle.id}`);
    }
  }, [searchParams, router, puzzle.id]);

  const [showJoin, setShowJoin] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [floorPlanOpen, setFloorPlanOpen] = useState(false);
  // admin 전용: MD 직통 조각(host_is_md)의 상담 상태 — puzzle_party_md 초대 여부
  const [partyMdStatus, setPartyMdStatus] = useState<{
    invited: boolean;
    md_name?: string;
    md_instagram?: string | null;
  } | null>(null);
  const [editingOffer, setEditingOffer] = useState<PuzzleOffer | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [offers, setOffers] = useState<PuzzleOffer[]>([]);
  const [myOffer, setMyOffer] = useState<PuzzleOffer | null>(null);
  const [acceptedOffer, setAcceptedOffer] = useState<PuzzleOffer | null>(null);
  const [showAcceptSheet, setShowAcceptSheet] = useState(false);
  const [pendingAcceptOfferId, setPendingAcceptOfferId] = useState<string | null>(null);
  const [acceptingMd, setAcceptingMd] = useState<NonNullable<PuzzleOffer["md"]> | null>(null);
  const [showLeaderInfo, setShowLeaderInfo] = useState(false);
  const [showCancelSheet, setShowCancelSheet] = useState(false);
  const [showMatchedShowcase, setShowMatchedShowcase] = useState(false);
  // 조각 카톡 공유 시트 (?created=share 자동 오픈 / 공유 버튼 수동 오픈)
  const [showShareCreated, setShowShareCreated] = useState(searchParams.get("created") === "share");
  const [shareCreatedMode, setShareCreatedMode] = useState<"created" | "share">("created");
  // 깃발 등록 직후 5자 리뷰 유도 팝업 — 최애 클럽 지정자에게만(rc/rn 파라미터), 기기당 최초 1회.
  const [showCreatedInfo, setShowCreatedInfo] = useState(false);
  const [reviewClub, setReviewClub] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (searchParams.get("created") !== "flag") return;
    const rc = searchParams.get("rc");
    const rn = searchParams.get("rn");
    if (!rc || !rn) return; // 최애 클럽 미지정 → 팝업 안 띄움
    const key = `flag_created_review_popup_seen`; // 깃발 ID 무관, 전 기기 최초 1회
    try {
      if (localStorage.getItem(key)) return; // 이미 본 적 있음
      localStorage.setItem(key, "1");
    } catch {
      /* noop */
    }
    setReviewClub({ id: rc, name: rn });
    setShowCreatedInfo(true);
  }, [searchParams, puzzle.id]);
  const recentMatchedPuzzle = useRecentMatchedPuzzle();

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/flags/${puzzle.id}${lq}`;
    const totalBudget =
      puzzle.total_budget ?? puzzle.budget_per_person * puzzle.target_count;
    const title = isForeigner ? `NightFlow Request · ${areaLabel(puzzle.area, lang)}` : `나플 깃발 · ${puzzle.area}`;
    const text = isForeigner
      ? `${areaLabel(puzzle.area, lang)} · ₩${totalBudget.toLocaleString()} · ${puzzle.target_count} ppl`
      : `${puzzle.area} · 총 ${Math.round(totalBudget / 10000)}만원 · ${puzzle.target_count}명`;
    // 앱(Capacitor): OS 공유 시트 우선 (WebView에서 navigator.share가 불안정)
    const native = await shareViaNative({ title, text, url });
    if (native.handled) return;

    // 웹: navigator.share(요약 텍스트 동봉) 대신 링크만 클립보드에 복사.
    // 붙여넣기 시 OG 카드가 자동 렌더되므로 순수 링크가 더 깔끔함.
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
  const musicTag =
    puzzle.music_preference === "hiphop"
      ? t("힙합 선호", "Hip-hop")
      : puzzle.music_preference === "edm"
        ? t("EDM 선호", "EDM")
        : null;
  const tags = puzzle.is_recruiting_party
    ? ([genderTag, ageTag, vibeTag, musicTag].filter(Boolean) as string[])
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

      // 상담 메타데이터(건수/마지막 시각/마지막 발신자)를 admin에게만 표시 (Migration 417 RPC)
      const { data: metaRes } = await supabase.rpc("admin_get_offer_md_replied", {
        p_puzzle_id: puzzle.id,
      });
      const metaMap = (metaRes as { success?: boolean; replied?: Record<string, OfferChatMeta> } | null)?.replied;
      if (metaMap) {
        merged = merged.map((o) => (metaMap[o.id] ? { ...o, chat_meta: metaMap[o.id] } : o));
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

  // admin 전용: MD 직통 조각(host_is_md)의 상담 상태 (puzzle_party_md 초대 여부)
  useEffect(() => {
    if (!isAdmin || !puzzle.host_is_md) return;
    supabase.rpc("admin_get_party_md_status", { p_puzzle_id: puzzle.id }).then(({ data }) => {
      if (data?.success) setPartyMdStatus(data);
    });
  }, [isAdmin, puzzle.host_is_md, puzzle.id, supabase]);

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
      toast.success(t(isRecruitingParty ? "조각을 내렸습니다" : "깃발을 내렸습니다", "Request taken down"));
      router.push(isForeigner ? "/en" : "/?tab=puzzle");
    } catch {
      toast.error(t("취소에 실패했습니다", "Failed to cancel"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm(`이 ${isRecruitingParty ? "조각" : "깃발"}에서 나가시겠습니까?`)) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("leave_puzzle", { p_puzzle_id: puzzle.id });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "나가기에 실패했습니다"); return; }
      toast.success(isRecruitingParty ? "조각에서 나왔습니다" : "깃발에서 나왔습니다");
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


  const handleAcceptOffer = (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer || !offer.md) {
      toast.error("파트너 정보를 불러오지 못했습니다");
      return;
    }
    setAcceptingMd(offer.md);
    setPendingAcceptOfferId(offerId);
    // 인앱 채팅(Migration 332)이 연락을 대체 → 방장 카카오 등록 안내 제거
    setShowAcceptSheet(true);
  };

  const handleAcceptConfirm = async (): Promise<boolean> => {
    if (!pendingAcceptOfferId) return false;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("accept_offer", {
        p_offer_id: pendingAcceptOfferId,
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
          <h1 className="text-[17px] font-black text-white flex-1">{t(isRecruitingParty ? "조각 상세" : "깃발 상세", "Request detail")}</h1>
          {currentUserId === puzzle.leader_id && isOpen && pendingOffers.length === 0 && (
            <Link
              // MD 직통 조각(host_is_md)은 등록과 동일한 AuctionForm 수정 폼으로, 그 외는 유저 조각/깃발 폼으로
              href={puzzle.host_is_md ? `/md/auctions/${puzzle.id}/edit` : `/flags/${puzzle.id}/edit${lq}`}
              aria-label={t(isRecruitingParty ? "조각 수정" : "깃발 수정", "Edit request")}
              className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </Link>
          )}
          {!isFull && !puzzle.host_is_md && (
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

        <div className={`space-y-5 ${(isRecruitingParty && isOpen && currentUserId && !isMember && !isLeader && !isMd) || (isRecruitingParty && isOpen && !currentUserId) ? "pb-28" : "pb-10"}`}>
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
              <button
                onClick={() => {
                  if (isRecruitingParty) {
                    // 조각: 카톡 공유 시트 (홈과 동일)
                    setShareCreatedMode("share");
                    setShowShareCreated(true);
                  } else {
                    handleShare();
                  }
                }}
                className="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-white transition-colors -mr-1 shrink-0"
              >
                <Share2 className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* 파트너 직통 — 제목 아래, 금액 위 (MD 직통만). 닉네임 버튼도 이 줄로 이동 */}
            {isRecruitingParty && puzzle.host_is_md && (
              <div className="space-y-2.5 pt-1 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {puzzle.leader && (
                    <button
                      type="button"
                      onClick={() => puzzle.leader_id && router.push(`/u/${puzzle.leader_id}`)}
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
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    <h2 className="text-[14px] font-black text-blue-400">파트너 직통</h2>
                  </div>
                </div>
              </div>
            )}

            {/* 예산 + 인원 pill + 닉네임 버튼 + 신뢰도 */}
            <div className="space-y-0.5">
              {isRecruitingParty ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 예산 표시 — 전원 동일하게 1인/현재 (역할 구분 없음) */}
                    <span className="text-[19px] font-bold text-green-400">
                      1인 {perPersonBudget.toLocaleString()}원
                    </span>
                    <span className="text-[13px] text-neutral-500">
                      / 현재 {(perPersonBudget * puzzle.current_count).toLocaleString()}원
                    </span>
                    {puzzle.leader && !puzzle.host_is_md && (
                      <button
                        type="button"
                        onClick={() => puzzle.leader_id && router.push(`/u/${puzzle.leader_id}`)}
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
                {puzzle.current_count >= puzzle.target_count && (
                  <span className="text-[13px] text-neutral-400">퍼즐 완성!</span>
                )}
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

          {/* MD 한마디 — 기본 정보 카드 바로 아래 (MD 직통만). 실제 한마디(md_comment) 있을 때만 노출.
              제목(notes)을 한마디로 재출력하지 않음 — 중복이라 의미 없음 */}
          {isRecruitingParty && puzzle.host_is_md && puzzle.md_comment && (
            <div className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl px-5 py-4 space-y-1">
              <p className="text-[11px] text-neutral-500 font-bold uppercase tracking-widest">파트너의 한마디</p>
              <p className="text-[14px] text-neutral-200 leading-relaxed whitespace-pre-line">{puzzle.md_comment}</p>
            </div>
          )}

          {/* MD 직통 테이블 정보 (파트너 헤더/클럽/이미지는 위 기본정보 안으로 이동) */}
          {isRecruitingParty && puzzle.host_is_md && (
            <>
              {/* 4. Table Details Card (테이블 구성 + 테이블맵 통합) — AuctionDetail과 동일 */}
              <TableDetailsCard
                includes={puzzle.includes || []}
                /* notes(제목)를 참고사항으로 재출력하면 상단 제목과 중복 → MD 한마디는 위 전용 박스로 노출 */
                notes={undefined}
                titleOverride={puzzle.club?.name ?? undefined}
                titleHref={puzzle.club?.id ? `/clubs/${puzzle.club.id}` : undefined}
                floorPlanSlot={
                  puzzle.club?.floor_plan_url && puzzle.table_info ? (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setFloorPlanOpen((v) => !v)}
                        className="w-full flex items-center justify-center gap-2"
                        aria-expanded={floorPlanOpen}
                      >
                        <h2 className="text-[14px] font-bold text-white">
                          {floorPlanOpen ? "테이블맵 닫기" : "테이블맵 보기"}
                        </h2>
                        <ChevronDown
                          className={`w-4 h-4 text-neutral-500 transition-transform ${floorPlanOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      <FloorPlanViewer
                        floorPlanUrl={puzzle.club.floor_plan_url}
                        positions={[]}
                        highlightLabel={puzzle.table_info}
                        showImage={floorPlanOpen}
                      />
                    </div>
                  ) : null
                }
              />

              {/* 클럽 위치 미니맵 — AuctionDetail과 동일 (모달 대신 지도앱 링크) */}
              {puzzle.club?.latitude && puzzle.club?.longitude && (
                <div>
                  <div className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-neutral-500" />
                        <h2 className="text-[14px] font-bold text-white">위치</h2>
                      </div>
                      <a
                        href={`https://maps.google.com/maps?q=${puzzle.club.latitude},${puzzle.club.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center p-2 -m-2 rounded-lg text-[12px] text-neutral-400 font-bold hover:text-white transition-colors active:bg-neutral-800"
                      >
                        지도앱으로 열기 →
                      </a>
                    </div>
                    <a
                      href={`https://maps.google.com/maps?q=${puzzle.club.latitude},${puzzle.club.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative rounded-xl overflow-hidden border border-neutral-800 w-full cursor-pointer block"
                    >
                      <iframe
                        src={`https://maps.google.com/maps?q=${puzzle.club.latitude},${puzzle.club.longitude}&z=16&output=embed&hl=ko`}
                        className="w-full h-[130px] pointer-events-none"
                        loading="lazy"
                        title={`${puzzle.club.name} 위치`}
                      />
                    </a>
                  </div>
                </div>
              )}
            </>
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
                              alt={md.display_name || "파트너"}
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
                        "파트너가 회원님이 등록한 오픈채팅으로 입장합니다. 선입금/테이블 배정은 파트너와 직접 협의하세요.",
                        "The club host will join your open chat. Arrange any deposit and table directly with them."
                      )
                    : t(
                        "위 연락 수단 중 편한 것으로 파트너에게 직접 연락해주세요. 선입금/테이블 배정은 파트너와 직접 협의하세요.",
                        "Contact the club host directly via one of the methods above. Arrange any deposit and table directly with them."
                      )
                  : isForeigner
                    ? `${offers.filter(o => o.status !== 'expired').length} clubs competed — matched`
                    : `파트너 ${offers.filter(o => o.status !== 'expired').length}명이 경쟁, 성사됨`}
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
                  <p className="text-neutral-500">SMS·알림톡 수신동의</p>
                  <p className={`font-bold ${leader.alimtalk_consent ? "text-green-400" : "text-red-400"}`}>
                    {leader.alimtalk_consent ? "동의함" : "미동의"}
                    {leader.alimtalk_consent && leader.alimtalk_consent_at && (
                      <span className="ml-1.5 text-[10px] font-normal text-neutral-500">
                        ({dayjs(leader.alimtalk_consent_at).format("YYYY-MM-DD")})
                      </span>
                    )}
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
                <p className="text-[10px] text-neutral-500">깃발 강제 종료 (참여자 알림 + 파트너 슬롯 회복)</p>
              </div>
              <AdminCancelPuzzleButton puzzleId={puzzle.id} />
            </section>
          )}

          {/* admin 전용: MD 직통 조각의 상담 상태 (오퍼 대신 puzzle_party_md 초대 여부로 판단) */}
          {isAdmin && puzzle.host_is_md && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[16px] leading-none">💌</span>
                <h2 className="text-[16px] font-bold text-neutral-200">상담 상태</h2>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-[#1C1C1E] p-4 space-y-3">
                {partyMdStatus === null ? (
                  <p className="text-[13px] text-neutral-500">불러오는 중…</p>
                ) : partyMdStatus.invited ? (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-[14px] font-bold text-white">{partyMdStatus.md_name}</p>
                      <span className="text-[12px] px-2.5 py-1 rounded-full bg-neutral-700 text-neutral-300 font-bold">상담중</span>
                    </div>
                    <div className="pt-2 mt-1 border-t border-red-500/20 bg-red-500/5 -mx-4 -mb-4 px-4 pb-4 space-y-1">
                      <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide">관리자 전용 — 파트너 식별 정보</p>
                      <div className="flex items-center gap-3 text-[12px] text-neutral-300 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3 text-neutral-500" />
                          <span className="font-bold text-white">{partyMdStatus.md_name}</span>
                        </span>
                        {partyMdStatus.md_instagram ? (
                          <a
                            href={`https://instagram.com/${partyMdStatus.md_instagram.replace(/^@/, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-pink-400 hover:text-pink-300"
                          >
                            <Instagram className="w-3 h-3" />
                            <span className="font-mono">@{partyMdStatus.md_instagram.replace(/^@/, "")}</span>
                          </a>
                        ) : (
                          <span className="text-neutral-600 text-[11px]">인스타 미등록</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-neutral-500">아직 초대된 파트너가 없어요</p>
                )}
              </div>
            </section>
          )}

          {/* 오퍼 섹션 — MD 직통 조각(host_is_md)은 오퍼를 안 받으므로 시크릿오퍼 숨김 (admin 상담상태는 위 카드로 대체) */}
          {!puzzle.host_is_md && (!isAccepted || ((isMd || isAdmin) && myOffer)) && (
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
              {puzzle.status === "open" ? (() => {
                const timeKo = puzzle.offer_deadline ? dayjs(puzzle.offer_deadline).format("h시") : "5시";
                const timeF = puzzle.offer_deadline ? dayjs(puzzle.offer_deadline).format("h A") : "5 PM";
                return (
                  <span className="text-[12px] text-neutral-400 whitespace-nowrap">
                    {t(
                      `⏰ 당일 ${timeKo} 마감`,
                      `⏰ Offers close ${timeF} on event day`,
                      `⏰ 当日${timeF} オファー締切`,
                      `⏰ 当天${timeF} 报价截止`,
                    )}
                  </span>
                );
              })() : (
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
                <FeatureGate flag="offer_chat">
                  <p className="text-[12px] text-neutral-400 bg-neutral-900/60 border border-neutral-800 rounded-xl px-3 py-2.5">
                    {isRecruitingParty
                      ? "💬 채팅에서 파티원과 상의한 뒤, 마음에 드는 파트너에게 예약하세요"
                      : "💬 마음에 드는 오퍼와 채팅으로 상담해보세요 · 깃발당 최대 3개"}
                  </p>
                </FeatureGate>
                {isRecruitingParty && (
                  <Link
                    href={`/party/${puzzle.id}`}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-white text-black font-black text-[14px] rounded-xl hover:bg-neutral-100 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {t("단체채팅 바로가기", "Go to group chat")}
                  </Link>
                )}
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
                    isRecruitingParty={isRecruitingParty}
                  />
                ))}
              </div>
            )}

            {/* 비방장: 테이블타입 공개 + 주류/extras blur 처리 */}
            {!isLeader && !isAccepted && (
              <div className="space-y-3 -mt-2">
                {/* 시크릿 오퍼 이유 + 소비자 이득 (왜 비공개인지 궁금증 해소) */}
                <details className="group rounded-xl bg-neutral-900/50 border border-neutral-800 overflow-hidden">
                  <summary className="flex items-center gap-1.5 px-3 py-2 cursor-pointer list-none select-none text-[12px] font-bold text-amber-400">
                    ⓘ {t("왜 오퍼가 비공개인가요?", "Why are offers secret?", "なぜオファーは非公開？", "为什么报价不公开？")}
                    <span className="ml-auto text-neutral-500 group-open:rotate-180 transition-transform text-[11px]">▾</span>
                  </summary>
                  <p className="px-3 pb-3 text-[12px] text-neutral-400 leading-relaxed break-keep">
                    {t(
                      "클럽끼리 서로의 오퍼를 볼 수 없어요. 그래서 눈치 보지 않고 각자 최고 조건을 던집니다.",
                      "Clubs can't see each other's offers, so each gives their real best without second-guessing.",
                      "クラブはお互いのオファーを見られません。だから様子見せず、各自が最高の条件を出します。",
                      "夜店看不到彼此的报价，所以各自盲投，给出真正的最优条件。",
                    )}
                  </p>
                </details>
                {pendingOffers.length === 0 && (
                  <p className="text-[12px] text-neutral-600 text-center py-2">
                    {t("오퍼를 기다리고 있어요", "No offers yet")}
                  </p>
                )}
                {publicOffers.map((offer, idx) => (
                  <div
                    key={offer.id}
                    className="bg-[#1C1C1E] rounded-2xl border border-dashed border-neutral-700 p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[14px] font-bold text-amber-300">Offer #{idx + 1}</p>
                        {offer.club?.name ? (
                          <span className="inline-block text-[18px] font-black text-white -mt-0.5 blur-sm select-none pointer-events-none">
                            {offer.club.name}
                          </span>
                        ) : null}
                      </div>
                      {offer.leader_chat_started_at && (
                        <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-white text-black font-bold">상담중</span>
                      )}
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
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[14px] font-bold text-amber-300">
                        Offer #{publicOffers.length + i + 1}
                      </p>
                      {offer.leader_chat_started_at && (
                        <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-white text-black font-bold">상담중</span>
                      )}
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
              </div>
            )}

            {/* MD/Admin 본인 오퍼 상태 — SecretOfferCard와 동일한 카드 디자인(중립 테마) */}
            {(isMd || isAdmin) && myOffer && (
              <div className={`rounded-2xl border p-4 space-y-3 ${
                myOffer.status === "accepted"
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-[#1C1C1E] border-neutral-800"
              }`}>
                {/* 헤더: 내 제안 라벨 + 클럽·지역 / 상태 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-neutral-500 mb-0.5">내 제안</p>
                    <p className="text-[15px] font-black text-white truncate">
                      {(myOffer.club as { name?: string } | null)?.name || "클럽"}
                    </p>
                  </div>
                  {myOffer.status === "accepted" && (
                    <span className="shrink-0 text-[11px] px-2.5 py-1 rounded-full font-bold bg-amber-500/20 text-amber-400">
                      {OFFER_STATUS_LABEL[myOffer.status]}
                    </span>
                  )}
                </div>

                {/* 가격 + includes + 코멘트 — 조각은 인원·가격 변동으로 고정가 숨김 */}
                <div className="space-y-2 pt-2 border-t border-neutral-800/60">
                  {!isRecruitingParty && (
                    <p className="text-[16px] font-black text-green-400">
                      {myOffer.proposed_price.toLocaleString()}원
                    </p>
                  )}
                  {myOffer.includes?.length > 0 && (() => {
                    const liquors = myOffer.includes.filter((i: string) => LIQUOR_KEYWORDS.some((kw) => i.includes(kw)));
                    const extras = myOffer.includes.filter((i: string) => !LIQUOR_KEYWORDS.some((kw) => i.includes(kw)));
                    return (
                      <div className="space-y-1.5">
                        {liquors.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {liquors.map((inc: string) => (
                              <span key={inc} className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                🍾 {isForeigner ? toEnglishInclude(inc) : inc}
                              </span>
                            ))}
                          </div>
                        )}
                        {extras.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {extras.map((inc: string) => (
                              <span key={inc} className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-neutral-900 text-neutral-500 border border-neutral-800">
                                {isForeigner ? toEnglishInclude(inc) : inc}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {myOffer.comment && (
                    <OfferCommentText comment={myOffer.comment} lang={lang} />
                  )}
                </div>

                {/* Migration 332: 방장과 1:1 대화 (깃발 전용). 조각은 단체채팅으로 통합 →
                    초대되면 나의 채팅/알림으로 진입하므로 여기 1:1 바로가기는 숨김. */}
                {!isRecruitingParty &&
                  (myOffer.leader_chat_started_at || myOffer.status === "accepted") &&
                  (myOffer.status === "pending" || myOffer.status === "accepted") && (
                  <FeatureGate flag="offer_chat">
                    <Link
                      href={`/messages/${myOffer.id}`}
                      className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl border border-neutral-700 bg-transparent text-neutral-200 hover:bg-neutral-800 font-bold text-[13px]"
                    >
                      <MessageCircle className="w-4 h-4" />
                      채팅 바로가기
                    </Link>
                  </FeatureGate>
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

          {/* 비방장·비멤버·비MD: 홈 캐러셀과 동일한 깃발꽂기 유도 CTA (비로그인 포함, 조각 상세는 숨김) */}
          {!isLeader && !isMember && !isMd && !isRecruitingParty && (
            <div className="text-center space-y-1">
              {currentUserId && pendingOffers.length > 0 && !isAccepted && (
                <button
                  type="button"
                  onClick={() => setShowMatchedShowcase(true)}
                  className="block w-full mb-2 text-center text-[13px] font-bold text-white hover:text-neutral-300 active:opacity-70 transition-colors"
                >
                  {t("어떤 오퍼 받았는지 구경하기 👈", "See what offers came in 👈")}
                </button>
              )}
              <p className="text-[14.5px] text-neutral-200 font-semibold mb-1.5">
                {t("최고의 테이블을 잡으세요.", "Land the best table.")}
              </p>
              <Link
                href={currentUserId ? `/flags/new${lq}` : `/login?redirect=${encodeURIComponent(`/flags/new${lq}`)}`}
                className="flex items-center justify-center w-full h-13 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-black text-[15px] rounded-2xl transition-all"
              >
                {t("⛳ 나도 깃발꽂기", "⛳ Plant a flag")}
              </Link>
              <p className="text-[10px] text-neutral-500">
                {t("모든 서비스 무료", "All services free")}
              </p>
            </div>
          )}

          {/* (초록 '조각 올리기' 유도 CTA 제거 — 조각 상세에선 참가 CTA만 노출.
              비로그인/종료 상태 모두 아래 스티키 '참가하기'/'로그인하고 참가'로 통일) */}

          {/* 참여자 목록: 파티원 모집 중일 때만.
              MD 직통 조각은 대표자(MD)가 주최자이지 파티원이 아니므로 목록에서 제외 → 실제 합류 유저만 노출 */}
          {isRecruitingParty && (() => {
            const partyMembers = puzzle.host_is_md
              ? members.filter((m) => m.user_id !== puzzle.leader_id)
              : members;
            if (partyMembers.length === 0) return null;
            return (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-neutral-400" />
              <h2 className="text-[14px] font-bold text-neutral-300">파티원</h2>
            </div>
            <div className="space-y-2">
              {partyMembers.map((member) => {
                const isMe = member.user_id === currentUserId;
                const isLeaderMember = member.user_id === puzzle.leader_id;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between bg-[#1C1C1E] rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      {member.user?.profile_image ? (
                        <img
                          src={member.user.profile_image}
                          alt={member.user.display_name || member.user.name || "파티원"}
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
                            <Link
                              href={`/u/${member.user_id}`}
                              className="hover:text-white/80 hover:underline transition-colors"
                            >
                              {member.user?.display_name || member.user?.name || "알 수 없음"}
                            </Link>
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
          );
          })()}

          {/* 대표자 전용 액션 */}
          {isLeader && isOpen && (
            <section className="space-y-2">
              <Button
                onClick={handleCancel}
                disabled={actionLoading}
                variant="outline"
                className="w-full h-12 border-red-500/50 bg-transparent text-red-400 hover:bg-red-500/10 font-bold text-[14px] rounded-2xl"
              >
                {t(isRecruitingParty ? "조각 내리기" : "깃발 내리기", "Take down request")}
              </Button>
            </section>
          )}


          {/* 미참여 유저 파티 합류 버튼: 파티원 모집 ON 일 때만 — 스티키 고정 */}
          {!isMember && !isLeader && !isMd && isOpen && currentUserId && isRecruitingParty && (
            <div className="fixed bottom-16 left-0 right-0 z-30 max-w-lg mx-auto px-4 pb-3 pt-3 bg-gradient-to-t from-black via-black/95 to-transparent">
              <Button
                onClick={() => setShowJoin(true)}
                className="w-full h-13 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-2xl transition-all active:scale-[0.98] shadow-lg"
              >
                참가하기
              </Button>
            </div>
          )}

          {/* 합류한 파티원(방장 아님): 조각에서 나가기 */}
          {isMember && !isLeader && !isMd && isRecruitingParty && (puzzle.status === "open" || puzzle.status === "selecting") && (
            <button
              type="button"
              onClick={handleLeave}
              className="w-full h-11 text-[13px] font-bold text-neutral-500 hover:text-red-400 transition-colors"
            >
              조각에서 나가기
            </button>
          )}

          {/* MD/Admin 제안하기 버튼 — MD 직통 조각(host_is_md)엔 다른 MD 오퍼 불가 */}
          {(isMd || isAdmin) && isOpen && !myOffer && !puzzle.host_is_md && (
            <div className="space-y-2">
              {/* 외국인 깃발 안내 (Migration 343 Escrow 결제 트리거) */}
              {puzzle.leader?.country_code && puzzle.leader.country_code !== "KR" && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[12px] text-amber-300 leading-relaxed">
                  💳 <strong>{t(isRecruitingParty ? "외국인 조각" : "외국인 깃발", isRecruitingParty ? "International Share" : "International Flag")}</strong> — {t("매칭 시 사용자가 즉시 선결제, 방문 확정 후 정산 (NightFlow 9% 차감 후 송금)", "Prepaid instantly on match, settled after the visit is confirmed (9% NightFlow fee deducted)")}
                </div>
              )}
              <Button
                onClick={() => setShowOffer(true)}
                className="w-full h-13 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-2xl"
              >
                오퍼하기
              </Button>
              <p className="text-[11px] text-neutral-600 text-center leading-relaxed">
                <FeatureGate
                  flag="offer_chat"
                  fallback={<>수락 시 30크레딧 차감 · 미선택 시 크레딧 차감 없음</>}
                >
                  제안 무료 · {isRecruitingParty ? "상담 시작 또는 수락시" : "첫 채팅 또는 수락시"} 크레딧 소모
                </FeatureGate>
              </p>
            </div>
          )}

          {/* MD가 다른 파트너의 직통 조각을 볼 때: 오퍼·참가 모두 불가라 화면이 비므로
              본인 조각 등록으로 유도 (MD에게 자연스러운 액션) */}
          {isMd && isRecruitingParty && puzzle.host_is_md && !isLeader && (
            <div className="text-center space-y-1">
              <p className="text-[13px] text-neutral-400 mb-1.5">
                {t("다른 파트너의 직통 조각이에요", "This is another partner's direct share")}
              </p>
              <Link
                href="/md/auctions/new"
                className="flex items-center justify-center w-full h-13 bg-green-500 hover:bg-green-400 active:scale-[0.98] text-black font-black text-[15px] rounded-2xl transition-all"
              >
                {t("🧩 내 조각도 올려보세요", "🧩 Post my share")}
              </Link>
              <p className="text-[10px] text-neutral-500">{t("등록 무료", "Free to post")}</p>
            </div>
          )}


          {/* 로그인 유도: 파티원 모집 ON 일 때만 — 스티키 고정 */}
          {!currentUserId && isOpen && isRecruitingParty && (
            <div className="fixed bottom-16 left-0 right-0 z-30 max-w-lg mx-auto px-4 pb-3 pt-3 bg-gradient-to-t from-black via-black/95 to-transparent">
              <Link href={`/login?redirect=${encodeURIComponent(`/flags/${puzzle.id}`)}`}>
                <Button className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-black text-[14px] rounded-2xl shadow-lg">
                  로그인하고 조각 참가하기
                </Button>
              </Link>
            </div>
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
        shareMode={isRecruitingParty}
      />

      {/* 조각 카톡 공유 시트 (등록 직후 자동 / 공유 버튼 수동) */}
      {showShareCreated && isRecruitingParty && (
        <ShareCreatedSheet
          puzzleId={puzzle.id}
          eventDate={puzzle.event_date}
          area={puzzle.area}
          perPerson={
            puzzle.budget_per_person ??
            (puzzle.target_count ? Math.round((puzzle.total_budget ?? 0) / puzzle.target_count) : 0)
          }
          mode={shareCreatedMode}
          hostIsMd={puzzle.host_is_md}
          clubName={puzzle.club?.name}
          clubThumbnail={puzzle.club?.thumbnail_url}
          onClose={() => setShowShareCreated(false)}
        />
      )}

      {/* 깃발 등록 직후 안내 팝업 (?created=flag) */}
      {showCreatedInfo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          onClick={() => { setShowCreatedInfo(false); router.replace(`/flags/${puzzle.id}${lq}`); }}
        >
          <div
            className={`relative w-full max-w-sm rounded-3xl bg-[#1C1C1E] border border-neutral-800 p-6 text-center ${
              reviewClub && !isForeigner ? "pb-14" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-black text-xl mb-2">
              {isForeigner ? "Your flag is up! 🎉" : "깃발 등록 완료! 🎉"}
            </h3>
            <p className="text-neutral-400 text-[13px] leading-relaxed">
              {isForeigner
                ? "Offers close at 8pm today. You have 60 more minutes to review."
                : "오퍼는 당일 8시 마감되고, 60분간 더 검토할 수 있어요."}
            </p>
            {reviewClub && !isForeigner ? (
              <div className="mt-6 pt-5 border-t border-neutral-800">
                <p className="text-[15px] text-white font-bold leading-snug mb-4">
                  <span className="text-amber-300">{reviewClub.name}</span>
                  {objParticle(reviewClub.name)} 5자로 표현해보세요!
                </p>
                <Link
                  href={`/clubs/${reviewClub.id}${lq}`}
                  onClick={() => setShowCreatedInfo(false)}
                  className="flex items-center justify-center gap-1.5 w-full h-12 rounded-xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                >
                  ⭐ 리뷰 구경하기
                </Link>
                <button
                  onClick={() => { setShowCreatedInfo(false); router.replace(`/flags/${puzzle.id}${lq}`); }}
                  className="absolute bottom-5 right-6 text-[13px] text-neutral-500 font-medium hover:text-neutral-300"
                >
                  다음에
                </button>
              </div>
            ) : (
              <Button
                onClick={() => { setShowCreatedInfo(false); router.replace(`/flags/${puzzle.id}${lq}`); }}
                className="w-full h-12 rounded-xl font-black text-[15px] bg-white hover:bg-neutral-200 text-black mt-6"
              >
                {isForeigner ? "Got it" : "확인"}
              </Button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
