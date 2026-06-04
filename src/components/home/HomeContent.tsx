"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuctionList } from "@/components/auctions/AuctionList";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CheckCircle2, X, PartyPopper, ChevronRight, Star } from "lucide-react";
import type { Auction, Puzzle } from "@/types/database";
import { ClubStrip } from "@/components/home/ClubStrip";
import { isAuctionExpired } from "@/lib/utils/auction";
import { closeExpiredAuctions } from "@/lib/utils/closeExpiredAuction";
import { isInstantEnabled } from "@/lib/features";
import { trackEvent, trackShareEvent } from "@/lib/analytics/events";
import { adjustMockAuctionDates } from "@/lib/utils/mockDates";
import { getPublicIncludes } from "@/lib/utils/liquor";
import { toast } from "sonner";
import { HomePuzzleCarousel } from "@/components/home/HomePuzzleCarousel";
import { HomeShareCarousel } from "@/components/home/HomeShareCarousel";
import { HotdealHomeSection } from "@/components/home/HotdealHomeSection";
import { ClubBenefitSection } from "@/components/home/ClubBenefitSection";
import { HotdealMdCta } from "@/components/home/HotdealMdCta";
import { GuestSignMdCta } from "@/components/home/GuestSignMdCta";

const FLAG_CTA_SHOWN_KEY = "nightflow_flag_onboarding_v1";

const ONBOARDING_STEPS = [
  {
    title: "1. 테이블 선택",
    desc: "오늘특가 중 원하는 클럽·테이블을 찾아보세요.",
    icon: <span className="text-[20px]">🔥</span>,
    color: "bg-amber-500/10",
  },
  {
    title: "2. MD 연락",
    desc: "예약하기 버튼을 눌러 담당 MD에게 연락하세요.",
    icon: <span className="text-[20px]">💬</span>,
    color: "bg-emerald-500/10",
  },
  {
    title: "3. 예약 확정",
    desc: "MD의 안내에 따라 예약하면 끝!",
    icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
    color: "bg-blue-500/10",
  },
];

const EARLYBIRD_ONBOARDING_STEPS = [
  {
    title: "1. 이벤트 둘러보기",
    desc: "얼리버드 이벤트 중 원하는 날짜·클럽을 골라요.",
    icon: <span className="text-[20px]">📅</span>,
    color: "bg-amber-500/10",
  },
  {
    title: "2. 경매 입찰",
    desc: "원하는 가격에 입찰하여 최저가에 도전해봐요!",
    icon: <span className="text-[20px]">🏆</span>,
    color: "bg-emerald-500/10",
  },
  {
    title: "3. 낙찰 & 예약",
    desc: "1등으로 낙찰되면, MD에게 연락해 예약을 확정받아요.",
    icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
    color: "bg-blue-500/10",
  },
];

const PUZZLE_ONBOARDING_STEPS = [
  {
    title: "1. 깃발꽂기",
    desc: "날짜·지역·예산을 자유롭게 정해요.",
    icon: <span className="text-[20px]">🚩</span>,
    color: "bg-amber-500/10",
  },
  {
    title: "2. 시크릿오퍼 받기",
    desc: "선택한 지역 클럽들이 오퍼를 보내요.\n→ 오퍼는 본인에게만 공개\n→ **100% 기밀, 맞춤 패키지!**",
    icon: <span className="text-[20px]">💌</span>,
    color: "bg-emerald-500/10",
  },
  {
    title: "3. 예약 확정",
    desc: "마음에 드는 오퍼 수락 → MD 매치\n바로 연락하면 예약 끝!",
    icon: <span className="text-[20px]">🎉</span>,
    color: "bg-rose-500/10",
  },
];

// 유저용 "시크릿오퍼란?" 설명 (3-포인트 + 감성 마무리)
const SECRET_OFFER_INTRO_USER = {
  title: "시크릿오퍼",
  points: [
    "오퍼는 방장에게만 공개돼요",
    "MD끼리도 서로 내용을 못 봐요",
    "오직 클럽명 + 조건으로 승부",
  ],
  highlights: [
    { emoji: "✨", text: "눈치보지 않는 경쟁으로 혜택 UP" },
    { emoji: "🎁", text: "최고의 오퍼를 택하는 즐거움!" },
  ],
};

// MD 전용 퍼즐 이용방법 (시크릿오퍼 핵심 가치 강조)
const SHARE_ONBOARDING_STEPS = [
  {
    title: "1. 파티 선택",
    desc: "MD가 세팅한 테이블에서\n원하는 조각을 골라요.",
    icon: <span className="text-[20px]">🧩</span>,
    color: "bg-green-500/10",
  },
  {
    title: "2. 참여 신청",
    desc: "참여하기 버튼을 누르면\n오픈채팅방에 바로 입장해요.",
    icon: <span className="text-[20px]">✋</span>,
    color: "bg-emerald-500/10",
  },
  {
    title: "3. 현장 N빵",
    desc: "인원이 다 모이면 당일 클럽에서\nMD에게 인당 금액 직접 결제!",
    icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
    color: "bg-blue-500/10",
  },
];

// MD 전용 조각 이용방법
const SHARE_ONBOARDING_STEPS_MD = [
  {
    title: "1. 조각 등록",
    desc: "테이블·인원·가격을 입력하면\n링크 하나로 끝!",
    icon: <span className="text-[20px]">🧩</span>,
    color: "bg-green-500/10",
  },
  {
    title: "2. 공유 & 모집",
    desc: "유저들이 조각을 골라\n오픈채팅방에 모여요.",
    icon: <span className="text-[20px]">🔗</span>,
    color: "bg-emerald-500/10",
  },
  {
    title: "3. 현장 N빵 수령",
    desc: "인원이 다 차면 당일 클럽에서\n인당 금액 직접 수령!",
    icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
    color: "bg-blue-500/10",
  },
];

const PUZZLE_ONBOARDING_STEPS_MD = [
  {
    title: "1. 입맛 다시기",
    desc: "유저들이 올린 퍼즐/깃발을 살펴봐요.\n예산·인원·날짜 한눈에 확인!",
    icon: <span className="text-[20px]">🍰</span>,
    color: "bg-amber-500/10",
  },
  {
    title: "2. 시크릿오퍼 제안",
    desc: "🔒 다른 MD는 못 봐요 (가격 눈치 X)\n🤫 인스타·연락처 비공개\n👁 방장 한 명만 봐요\n⚔️ 오직 클럽명 + 조건으로 승부!",
    icon: <span className="text-[20px]">✉️</span>,
    color: "bg-emerald-500/10",
  },
  {
    title: "3. 예약 확정하기",
    desc: "선택된 파트너님의 연락처만이 방장에게 공개돼요.",
    icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
    color: "bg-blue-500/10",
  },
];

type TabPromise = { content: React.ReactNode; note?: React.ReactNode };

const TAB_PROMISES: Record<"today" | "advance" | "puzzle" | "share", TabPromise> = {
  today: { content: "지금 비어있는 자리, 한눈에" },
  advance: {
    content: (
      <>
        <div className="text-[14.5px]">먼저 예약하는 당신,</div>
        <div className="text-[14.5px]">
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle whitespace-normal">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              주대는
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-black tracking-wider bg-red-500/15 text-red-400 border border-red-500/30">↓ DOWN</span>
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              서비스는
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-black tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">↑ UP</span>
            </span>
          </span>
        </div>
        <div className="text-[15.5px]">지금 바로 입찰해보세요!</div>
      </>
    ),
  },
  puzzle: {
    content: (
      <>
        퍼즐이 다 모이면 <span className="text-amber-400">깃발</span>로 승격!
        <br />
        깃발에는 MD들이 시크릿오퍼
        <br />
        <span className="text-emerald-400">가격·패키지 비교하고 골라요.</span>
      </>
    ),
  },
  share: {
    content: (
      <>
        <div className="text-[14.5px] text-white">예산은 있는데, 인원이 모자라다면?</div>
        <div className="text-[15.5px] text-white">클릭 한 번으로 파티 참가!</div>
      </>
    ),
  },
};

const TAB_PROMISES_MD: Record<"today" | "advance" | "puzzle" | "share", TabPromise> = {
  today: { content: "지금 비어있는 자리, 한눈에" },
  advance: {
    content: (
      <>
        <div className="text-[14.5px]">주말 빈 테이블 걱정이시죠?</div>
        <div className="text-[15.5px]">최소 수익을 미리 확정하고, 최고가를 발견해봐요! 🎯</div>
      </>
    ),
    note: "💰 수수료 0% · MD 직접 수령",
  },
  puzzle: {
    // content는 HomeContent 내부에서 JSX로 재정의 (시크릿오퍼란? 버튼 포함)
    content: "유저들의 예산이 기다리고 있어요 💰\n시크릿오퍼로 매출을 올려봐요!",
    note: "💰 제안 무료 · 매칭 시 직접 거래",
  },
  share: {
    content: (
      <>
        <div className="text-[14.5px] text-white">이번주 조각을 미리 올려보세요!</div>
        <div className="text-[15.5px] text-white">링크 하나로 공유, 인원관리도 간편해요!</div>
      </>
    ),
    note: "🧩 수수료 0% · 현장 직접 수령",
  },
};

interface HomeContentProps {
  activeAuctions: Auction[];
  puzzles?: Puzzle[];
  puzzleOfferCounts?: Record<string, number>;
  clubs?: { id: string; name: string; area: string; thumbnail_url: string | null }[];
}

export function HomeContent({
  activeAuctions: rawActiveAuctions,
  puzzles = [],
  puzzleOfferCounts = {},
  clubs = [],
}: HomeContentProps) {
  const activeAuctions = useMemo(() => {
    return rawActiveAuctions.map(adjustMockAuctionDates);
  }, [rawActiveAuctions]);

  const { user, isLoading } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [showMDWelcome, setShowMDWelcome] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  // 가이드는 항상 닫힘 상태로 시작. "ⓘ 깃발 이용 방법" 버튼으로만 펼침.
  const [showGuide, setShowGuide] = useState(false);
  const guideAutoOpenedRef = useRef(false);
  // 가이드 모드는 단일 (full만) — 시크릿오퍼는 PUZZLE_ONBOARDING_STEPS 2단계에 통합됨
  const [guideMode, setGuideMode] = useState<"full">("full");
  // 첫 방문 시 캐러셀 위 인라인 가이드 (Tip 박스 자리). 닫으면 영구 숨김.
  const [showTopGuide, setShowTopGuide] = useState(false);

  // Tip 박스 콘텐츠 로테이션 (기본 메시지 ↔ 매치 오퍼 보기)
  const [tipRotation, setTipRotation] = useState(0);
  const [tipResetKey, setTipResetKey] = useState(0);
  const [tipDragOffset, setTipDragOffset] = useState(0);
  const [tipIsDragging, setTipIsDragging] = useState(false);
  const tipContainerRef = useRef<HTMLDivElement>(null);
  const tipSwipeRef = useRef<{ startX: number; startY: number; active: boolean; width: number } | null>(null);
  useEffect(() => {
    const id = setInterval(() => setTipRotation((v) => (v + 1) % 2), 5000);
    return () => clearInterval(id);
  }, [tipResetKey]);

  // Tip 박스에 data-no-pull-refresh 부착. PullToRefresh 컴포넌트가 자동으로 pull 동작 차단.
  const tipBoxRef = useRef<HTMLDivElement>(null);
  const changeTipRotation = (next: number | ((v: number) => number)) => {
    setTipRotation(next);
    setTipResetKey((k) => k + 1);
  };

  // 최근 매치된 깃발 1건 (모달용) — RPC로 안전 필드만 조회
  type RecentMatchedPuzzle = {
    id: string;
    area: string;
    event_date: string;
    target_count: number;
    total_budget: number | null;
    budget_per_person: number;
    notes: string | null;
    matched_at: string;
    club_name: string | null;
    offer_includes: string[];
    offer_comment: string | null;
    md_display_name: string | null;
    md_instagram: string | null;
  };
  const [recentMatchedPuzzle, setRecentMatchedPuzzle] = useState<RecentMatchedPuzzle | null>(null);
  const [showMatchedModal, setShowMatchedModal] = useState(false);

  // 매치된 본인 깃발 중 이벤트 다음날 + 리뷰 미작성 → 첫 접속 시 시트 노출
  // 디버그: ?forceReview=1 쿼리 있으면 세션 키 무시하고 무조건 노출 (최근 매치 1건 사용)
  const reviewToastFiredRef = useRef(false);
  const [reviewPrompt, setReviewPrompt] = useState<{ puzzleId: string; clubName: string | null } | null>(null);
  const [reviewPromptHover, setReviewPromptHover] = useState(0);
  const [reviewPromptRating, setReviewPromptRating] = useState(0);
  const [reviewPromptTags, setReviewPromptTags] = useState<string[]>([]);
  const [reviewPromptComment, setReviewPromptComment] = useState("");
  const [reviewPromptSubmitting, setReviewPromptSubmitting] = useState(false);
  const REVIEW_PROMPT_TAGS = ["친절해요", "가격 만족", "분위기 좋음", "서비스 좋음", "위치 좋음", "추천해요"];
  const REVIEW_RATING_LABELS: Record<number, string> = {
    1: "아쉬워요",
    2: "별로예요",
    3: "보통이에요",
    4: "좋아요",
    5: "최고예요",
  };
  const resetReviewPrompt = () => {
    setReviewPrompt(null);
    setReviewPromptHover(0);
    setReviewPromptRating(0);
    setReviewPromptTags([]);
    setReviewPromptComment("");
    setReviewPromptSubmitting(false);
  };
  const handleReviewPromptSubmit = async () => {
    const id = reviewPrompt?.puzzleId;
    if (!id || reviewPromptRating === 0) return;
    setReviewPromptSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("submit_puzzle_review", {
        p_puzzle_id: id,
        p_rating: reviewPromptRating,
        p_comment: reviewPromptComment.trim() || null,
        p_tags: reviewPromptTags,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string } | null;
      if (!result?.success) {
        toast.error(result?.error || "리뷰 등록에 실패했어요");
        setReviewPromptSubmitting(false);
        return;
      }
      toast.success("리뷰가 등록되었어요. 감사합니다!");
      resetReviewPrompt();
    } catch (err) {
      console.error("[reviewPrompt submit]", err);
      toast.error("리뷰 등록에 실패했어요. 다시 시도해주세요.");
      setReviewPromptSubmitting(false);
    }
  };
  useEffect(() => {
    if (reviewToastFiredRef.current) return;
    if (!user?.id) {
      return;
    }
    reviewToastFiredRef.current = true;
    const forceReview = searchParams.get("forceReview") === "1";
    (async () => {
      const today = new Date();
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const cutoff = yesterday.toISOString().slice(0, 10);
      const query = supabase
        .from("puzzles")
        .select("id, event_date, accepted_offer_id")
        .eq("leader_id", user.id)
        .eq("status", "accepted")
        .order("event_date", { ascending: false })
        .limit(5);
      if (!forceReview) query.lte("event_date", cutoff);
      const { data: matched } = await query;
      const candidates = (matched ?? []) as Array<{ id: string; event_date: string; accepted_offer_id: string | null }>;
      if (candidates.length === 0) {
        return;
      }

      let unreviewed: { id: string; accepted_offer_id: string | null } | null = null;
      // accepted_offer_id가 NULL인 비정상 깃발은 건너뜀
      const validCandidates = candidates.filter((p) => p.accepted_offer_id);
      if (validCandidates.length === 0) {
        return;
      }
      if (forceReview) {
        unreviewed = validCandidates[0];
      } else {
        const ids = validCandidates.map((p) => p.id);
        const { data: existingReviews } = await supabase
          .from("puzzle_reviews")
          .select("puzzle_id")
          .eq("leader_id", user.id)
          .in("puzzle_id", ids);
        const reviewed = new Set(((existingReviews ?? []) as Array<{ puzzle_id: string }>).map((r) => r.puzzle_id));
        unreviewed = validCandidates.find((p) => !reviewed.has(p.id)) ?? null;
      }
      if (!unreviewed) return;

      if (!forceReview) {
        const sessionKey = `nightflow_review_toast_shown_${unreviewed.id}`;
        try { if (sessionStorage.getItem(sessionKey)) { return; } } catch {}
        try { sessionStorage.setItem(sessionKey, "1"); } catch {}
      }

      let clubName: string | null = null;
      if (unreviewed.accepted_offer_id) {
        const { data: offer } = await supabase
          .from("puzzle_offers")
          .select("club:clubs(name)")
          .eq("id", unreviewed.accepted_offer_id)
          .maybeSingle();
        const club = (offer as { club?: { name?: string } | { name?: string }[] | null } | null)?.club;
        const c = Array.isArray(club) ? club[0] : club;
        clubName = c?.name ?? null;
      }

      if (!clubName) {
        console.warn("[reviewPrompt] skipped — missing club info", {
          puzzle_id: unreviewed.id,
          accepted_offer_id: unreviewed.accepted_offer_id,
        });
        return;
      }

      setReviewPrompt({ puzzleId: unreviewed.id, clubName });
    })();
  }, [user?.id, supabase, searchParams]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_recent_matched_puzzle");
      if (error) return;
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!cancelled && row) setRecentMatchedPuzzle(row as RecentMatchedPuzzle);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // 첫 방문 시 캐러셀 위 가이드 자동 표시 (StrictMode 이중 호출 가드)
  useEffect(() => {
    if (guideAutoOpenedRef.current) return;
    guideAutoOpenedRef.current = true;
    if (!localStorage.getItem(FLAG_CTA_SHOWN_KEY)) {
      setShowTopGuide(true);
    }
  }, []);

  const dismissTopGuide = () => {
    setShowTopGuide(false);
    try { localStorage.setItem(FLAG_CTA_SHOWN_KEY, "1"); } catch {}
  };

  const instantEnabled = isInstantEnabled();
  const advanceCount = activeAuctions.filter(a => a.listing_type === 'auction').length;
  const shareCount = activeAuctions.filter(a => a.listing_type === 'share').length;
  const isMdOrAdminUser = user?.role === "md" || user?.role === "admin";
  // 조각 탭 노출 조건: MD/Admin은 항상, 일반/비로그인은 조각이 1개 이상일 때만
  const showShareTab = isMdOrAdminUser || shareCount > 0;
  const normalizeTab = (t: string | null): "today" | "advance" | "puzzle" | "share" => {
    if (t === "today" && instantEnabled) return "today";
    if (t === "advance") return "advance";
    if (t === "puzzle") return "puzzle";
    if (t === "share") return showShareTab ? "share" : "puzzle";
    return "puzzle";
  };

  // URL에서 탭 상태 읽어오기 (instant off 시 today → puzzle)
  const [currentTab, setCurrentTab] = useState<"today" | "advance" | "puzzle" | "share">(() => {
    return normalizeTab(searchParams.get("tab"));
  });

  // ?detail=1이면 기존 풀 화면(Tip/지역탭/통계/전체 카드), 없으면 compact (첫 카드 캐러셀)
  const isDetailMode = searchParams.get("detail") === "1";

  // 탭 변경 시 URL 업데이트 — router.replace는 서버 컴포넌트 refetch를 유발해
  // 캐러셀이 깜빡임. URL만 history API로 갱신하고, 페이지 상태는 setCurrentTab으로 즉시 반영.
  const handleTabChange = (tab: "today" | "advance" | "puzzle" | "share") => {
    const safe = normalizeTab(tab);
    setCurrentTab(safe);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("tab", safe);
      window.history.replaceState(null, "", `?${params.toString()}`);
    }
  };

  useEffect(() => {
    const tab = normalizeTab(searchParams.get("tab"));
    if (tab !== currentTab) setCurrentTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, currentTab]);

  // 조각 탭이 숨겨진 상태에서 share 탭에 머물러 있으면 puzzle로 폴백
  useEffect(() => {
    if (currentTab === "share" && !showShareTab) {
      handleTabChange("puzzle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showShareTab, currentTab]);

  useEffect(() => {
    if (currentTab === "share") {
      trackShareEvent("share_tab_view", { source: "home" });
    }
  }, [currentTab]);

  useEffect(() => {
    if (!welcomeDismissed && user?.role === "md" && user?.md_status === "approved" && user?.md_welcome_shown === false) {
      setShowMDWelcome(true);
    }
  }, [user, welcomeDismissed]);


  const handleDismissMDWelcome = async () => {
    setShowMDWelcome(false);
    setWelcomeDismissed(true);
    if (user) {
      await supabase.from("users").update({ md_welcome_shown: true }).eq("id", user.id);
    }
  };

  const handleGoToCreateAuction = async () => {
    setShowMDWelcome(false);
    setWelcomeDismissed(true);
    if (user) {
      await supabase.from("users").update({ md_welcome_shown: true }).eq("id", user.id);
    }
    router.push("/md/auctions/new");
  };

  const [auctions, setAuctions] = useState({
    active: activeAuctions,
  });

  // 사용자 입찰 상태 (경매별 최고 입찰가)
  const [userBidMap, setUserBidMap] = useState<Map<string, number>>(new Map());

  // 사용자 오늘특가 관심 등록 상태
  const [userInterestedSet, setUserInterestedSet] = useState<Set<string>>(new Set());

  // 차단한 사용자 ID 집합 (Apple Guideline 1.2 — 차단 시 피드 즉시 제거)
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  // 유저 관심/입찰/차단 병렬 fetch (Promise.all 로 RTT 절감)
  useEffect(() => {
    if (!user) {
      setUserInterestedSet(new Set());
      setUserBidMap(new Map());
      setBlockedUserIds(new Set());
      return;
    }
    const auctionIds = auctions.active.map(a => a.id);
    const fetchAll = async () => {
      const [interestsResult, bidsResult, blocksResult] = await Promise.all([
        supabase.from("chat_interests").select("auction_id").eq("user_id", user.id),
        auctionIds.length > 0
          ? supabase
              .from("bids")
              .select("auction_id, bid_amount")
              .eq("bidder_id", user.id)
              .in("auction_id", auctionIds)
              .order("bid_amount", { ascending: false })
          : Promise.resolve({ data: [] as { auction_id: string; bid_amount: number }[] }),
        supabase.from("user_blocks").select("blocked_id").eq("blocker_id", user.id),
      ]);
      if (interestsResult.data) {
        setUserInterestedSet(new Set(interestsResult.data.map((d: { auction_id: string }) => d.auction_id)));
      }
      if (bidsResult.data) {
        const map = new Map<string, number>();
        for (const bid of bidsResult.data) {
          if (!map.has(bid.auction_id)) map.set(bid.auction_id, bid.bid_amount);
        }
        setUserBidMap(map);
      }
      if (blocksResult.data) {
        setBlockedUserIds(new Set(blocksResult.data.map((d: { blocked_id: string }) => d.blocked_id)));
      }
    };
    fetchAll();
  }, [user, auctions.active, supabase]);

  // 차단한 사용자의 경매/퍼즐 필터링
  const visibleAuctions = useMemo(() => {
    if (blockedUserIds.size === 0) return auctions.active;
    return auctions.active.filter((a) => !a.md_id || !blockedUserIds.has(a.md_id));
  }, [auctions.active, blockedUserIds]);

  const visiblePuzzles = useMemo(() => {
    const filtered = blockedUserIds.size === 0
      ? puzzles
      : puzzles.filter((p) => !p.leader_id || !blockedUserIds.has(p.leader_id));
    // NEW(등록 6시간 이내) 우선, 그 다음 이벤트 마감일 빠른 순
    const now = Date.now();
    return [...filtered].sort((a, b) => {
      const aNew = now - new Date(a.created_at).getTime() < 6 * 60 * 60 * 1000 ? 0 : 1;
      const bNew = now - new Date(b.created_at).getTime() < 6 * 60 * 60 * 1000 ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
    });
  }, [puzzles, blockedUserIds]);

  // Props 업데이트 시 로컬 상태 동기화 (global router.refresh 대응)
  useEffect(() => {
    setAuctions({
      active: activeAuctions,
    });
  }, [activeAuctions]);

  // Gap 9.2: 홈 카드에 보이는 만료 경매 즉시 종료 (cron 5분 대기 없이 클라이언트 트리거)
  // 백그라운드 탭에서는 폴링 중단 (성능 + 네트워크 절약)
  useEffect(() => {
    const checkExpired = async () => {
      if (document.hidden) return;
      const expired = auctions.active
        .filter((a) => a.status === "active" && isAuctionExpired(a))
        .map((a) => a.id);
      if (expired.length === 0) return;

      const supabase = createClient();
      const closedIds = await closeExpiredAuctions(expired, supabase);
      if (closedIds.length > 0) {
        router.refresh(); // ISR 재검증 → 리스트에서 제거
      }
    };

    checkExpired(); // 즉시 1회
    const id = setInterval(checkExpired, 5000); // 5초 주기 (백그라운드에서는 no-op)
    const handleVisibility = () => {
      if (!document.hidden) checkExpired(); // 포그라운드 복귀 시 즉시 체크
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [auctions.active, router]);



  // 이용 방법 카드는 기본 닫힘. AuctionList의 "ⓘ 깃발 이용 방법" 버튼 → onShowGuide 콜백으로만 활성화.

  const dismissGuide = () => {
    setGuideMode("full");
    setShowGuide(false);
    try { localStorage.setItem(FLAG_CTA_SHOWN_KEY, "1"); } catch {}
  };

  // Compact/Full 모드 공통 Sheet들 (MD 승인 축하 + 깃발 CTA)
  const renderHomeSheets = () => (
    <>
      {/* 리뷰 작성 시트 (첫 접속 시 자동 노출) — 별점·태그·멘트 한 번에 */}
      <Sheet open={!!reviewPrompt} onOpenChange={(open) => { if (!open) resetReviewPrompt(); }}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl px-6 pt-7 pb-8 max-w-lg mx-auto max-h-[92vh] overflow-y-auto"
        >
          <SheetHeader className="text-center">
            <SheetTitle className="text-white text-[18px] font-black tracking-tight">
              {reviewPrompt?.clubName
                ? `${reviewPrompt.clubName}에서의 시간 어떠셨어요?`
                : "지난번 매치 어떠셨어요?"}
            </SheetTitle>
            <SheetDescription className="text-neutral-400 text-[13px] font-medium mt-1.5 leading-relaxed">
              리뷰를 남겨주시면 MD에게 큰 도움이 돼요
            </SheetDescription>
          </SheetHeader>

          {/* 별점 */}
          <div
            className="mt-6 flex items-center justify-center gap-1.5"
            onMouseLeave={() => setReviewPromptHover(0)}
          >
            {[1, 2, 3, 4, 5].map((n) => {
              const active = reviewPromptHover ? n <= reviewPromptHover : n <= reviewPromptRating;
              return (
                <button
                  key={n}
                  type="button"
                  onMouseEnter={() => setReviewPromptHover(n)}
                  onClick={() => setReviewPromptRating(n)}
                  className="p-1 active:scale-90 transition-transform"
                  aria-label={`${n}점`}
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      active ? "fill-amber-400 text-amber-400" : "fill-transparent text-neutral-700"
                    }`}
                    strokeWidth={1.5}
                  />
                </button>
              );
            })}
          </div>
          <p
            className={`text-center text-[13px] font-bold mt-1 tracking-tight ${
              (reviewPromptHover || reviewPromptRating) > 0 ? "text-amber-300" : "text-neutral-600"
            }`}
          >
            {(reviewPromptHover || reviewPromptRating) > 0
              ? REVIEW_RATING_LABELS[reviewPromptHover || reviewPromptRating]
              : "별을 눌러 평가해주세요"}
          </p>

          {/* 한마디 */}
          <div className="mt-5 space-y-2">
            <p className="text-[13px] font-bold text-neutral-300">
              한마디 <span className="text-[11px] text-neutral-500 font-medium">(선택)</span>
            </p>
            <textarea
              value={reviewPromptComment}
              onChange={(e) => setReviewPromptComment(e.target.value)}
              placeholder="어떤 점이 좋았는지, 다음 손님께 추천 한마디 부탁드려요"
              rows={3}
              maxLength={300}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-[13.5px] text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
            <p className="text-[10.5px] text-neutral-600 text-right">{reviewPromptComment.length}/300</p>
          </div>

          {/* 제출 + 닫기 */}
          <div className="mt-5 space-y-2">
            <Button
              onClick={handleReviewPromptSubmit}
              disabled={reviewPromptRating === 0 || reviewPromptSubmitting}
              className="w-full h-12 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-black text-[15px] rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {reviewPromptSubmitting ? "등록 중..." : "리뷰 등록하기"}
            </Button>
            <button
              type="button"
              onClick={resetReviewPrompt}
              className="w-full h-10 text-neutral-500 hover:text-neutral-300 font-medium text-[13px] transition-colors"
            >
              다음에 할게요
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 최근 매치 깃발 모달 */}
      <Sheet open={showMatchedModal} onOpenChange={setShowMatchedModal}>
        <SheetContent
          side="bottom"
          className="h-auto bg-[#0A0A0A] border-neutral-800 rounded-t-3xl px-5 pt-5 pb-8 max-h-[80vh] overflow-y-auto gap-2"
        >
          <SheetHeader className="text-left p-0 gap-0 mb-1">
            <SheetTitle className="text-white text-[24px] font-black tracking-tight leading-tight">
              😎 이 정도는 받아야죠
            </SheetTitle>
          </SheetHeader>
          {recentMatchedPuzzle && (
            <div className="space-y-3">
              <div className="bg-[#1C1C1E] rounded-2xl p-4 space-y-2 relative">
                <span className="absolute top-3 right-3 text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full leading-none">
                  성사됨
                </span>
                <div>
                  <p className="text-[14px] font-medium text-neutral-400 break-keep">
                    {recentMatchedPuzzle.notes || `${recentMatchedPuzzle.area}에서 모여요`}
                  </p>
                  <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                    {recentMatchedPuzzle.area} · {recentMatchedPuzzle.target_count}명
                  </p>
                </div>
                <div className="text-[20px] font-black text-green-400 tracking-tight">
                  예산 {(recentMatchedPuzzle.total_budget ?? recentMatchedPuzzle.budget_per_person * recentMatchedPuzzle.target_count).toLocaleString()}원
                </div>
                {recentMatchedPuzzle.club_name && (
                  <div className="pt-2 border-t border-neutral-800 space-y-1.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-[17px] font-black text-amber-300 tracking-tight">{recentMatchedPuzzle.club_name}</p>
                      {recentMatchedPuzzle.md_instagram && (
                        <p className="text-[11.5px] text-neutral-400 font-medium">
                          @{recentMatchedPuzzle.md_instagram}
                        </p>
                      )}
                    </div>
                    {(() => {
                      const pub = getPublicIncludes(recentMatchedPuzzle.offer_includes);
                      // 매치 카드는 원본 이름 그대로 노출 (모엣 샹동 5병 등). 분류만 활용.
                      const liquorItems: string[] = [];
                      const extraItems: string[] = [];
                      for (const item of recentMatchedPuzzle.offer_includes) {
                        if (pub.liquorCategories.some((c) => item.includes(c.split(" ")[0])) || /\d+병/.test(item)) {
                          liquorItems.push(item);
                        } else {
                          extraItems.push(item);
                        }
                      }
                      return (
                        <div className="space-y-1">
                          {liquorItems.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {liquorItems.map((item) => (
                                <span
                                  key={item}
                                  className="text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                >
                                  🍾 {item}
                                </span>
                              ))}
                            </div>
                          )}
                          {extraItems.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {extraItems.map((ext) => (
                                <span
                                  key={ext}
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-900 text-neutral-400 border border-neutral-800"
                                >
                                  {ext}
                                </span>
                              ))}
                            </div>
                          )}
                          {recentMatchedPuzzle.offer_comment && (
                            <p className="text-[12px] text-neutral-300 italic leading-snug pt-1">
                              &ldquo;{recentMatchedPuzzle.offer_comment}&rdquo;
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              {/* 인스타 일반 예약 대비 추가 혜택 — 이 쇼케이스 매치 전용 하드코딩 사실 */}
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/20 border border-amber-400/40 px-4 py-3.5">
                <span className="text-[20px] leading-none">🎉</span>
                <p className="text-[16px] font-black text-amber-200 leading-snug break-keep text-center tracking-tight">
                  <span className="text-shimmer-gold">
                    인스타 예약보다
                  </span>{" "}
                  <span className="text-amber-300">30만원치 더</span> 받았어요
                </p>
              </div>
              <div className="text-center space-y-1">
                <Link
                  href={user ? "/flags/new" : "/login?redirect=/flags/new"}
                  onClick={() => setShowMatchedModal(false)}
                  className="flex items-center justify-center w-full h-11 bg-neutral-800 hover:bg-neutral-700 active:scale-[0.98] text-neutral-200 font-bold text-[14px] rounded-2xl transition-all"
                >
                  ⛳ 나도 깃발꽂기
                </Link>
                <p className="text-[10.5px] text-neutral-500">모든 서비스 무료</p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* MD 파트너 승인 축하 Sheet (최초 1회) */}
      <Sheet open={showMDWelcome} onOpenChange={(open) => { if (!open) handleDismissMDWelcome(); }}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl px-6 pb-10"
        >
          <SheetHeader className="text-center pt-2">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <PartyPopper className="w-8 h-8 text-amber-500" />
            </div>
            <SheetTitle className="text-white font-black text-2xl">
              축하합니다!
            </SheetTitle>
            <SheetDescription className="text-neutral-400 text-sm leading-relaxed mt-2">
              NightFlow 파트너로 승인되었습니다.
              <br />
              지금 바로 테이블을 등록하고 첫 매출을 만들어보세요.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 mt-6">
            <div className="flex items-center gap-3 bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center text-green-500 font-black text-sm shrink-0">1</div>
              <p className="text-[13px] text-neutral-300 font-medium">
                <span className="text-white font-bold">주말(공휴일) 테이블</span>을 경매로 올리세요
              </p>
            </div>
            <div className="flex items-center gap-3 bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center text-green-500 font-black text-sm shrink-0">2</div>
              <p className="text-[13px] text-neutral-300 font-medium">
                유저들이 실시간으로 <span className="text-white font-bold">입찰 경쟁</span>합니다
              </p>
            </div>
            <div className="flex items-center gap-3 bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center text-green-500 font-black text-sm shrink-0">3</div>
              <p className="text-[13px] text-neutral-300 font-medium">
                낙찰되면 <span className="text-white font-bold">유저가 직접 연락</span>드려요
              </p>
            </div>
          </div>

          <div className="space-y-3 mt-6">
            <Button
              onClick={handleGoToCreateAuction}
              className="w-full h-14 bg-white hover:bg-neutral-200 text-black font-black text-base rounded-2xl transition-all active:scale-[0.98]"
            >
              경매 올리기
            </Button>
            <button
              onClick={handleDismissMDWelcome}
              className="w-full text-center text-sm text-neutral-500 hover:text-neutral-300 transition-colors py-2 font-medium"
            >
              나중에 둘러볼게요
            </button>
          </div>
        </SheetContent>
      </Sheet>

    </>
  );



  // Compact 모드: 깃발/조각 첫 카드 캐러셀 + HOT DEAL 섹션 (기본 홈)
  if (!isDetailMode) {
    const detailHref = (tab: string) => `/?tab=${tab}&detail=1`;
    const isMdOrAdmin = user?.role === "md" || user?.role === "admin";
    const newFlagHref = user ? "/flags/new" : "/login?redirect=/flags/new";

    // 탭별 Tip 콘텐츠 (풀 화면과 일관)
    const userPuzzleTipContent = (
      <div className="text-white">
        오퍼 먼저 받아보고, 별로면 패스해도 <span className="text-amber-300 font-black">OK!</span>
      </div>
    );
    const mdPuzzleTipContent = (
      <>
        <div>유저들의 예산이 기다리고 있어요 💰</div>
        <div>시크릿오퍼로 매출을 올려봐요!</div>
      </>
    );
    const mdShareTipContent = (
      <>
        <div className="text-white">이번주 조각을 미리 올려보세요!</div>
        <div className="text-white">링크 하나로 공유, 인원관리도 간편해요!</div>
      </>
    );
    const compactTipContent: Record<"puzzle" | "share", React.ReactNode> = {
      puzzle: isMdOrAdmin ? mdPuzzleTipContent : userPuzzleTipContent,
      share: isMdOrAdmin ? mdShareTipContent : TAB_PROMISES.share.content,
    };
    const compactSteps =
      currentTab === "puzzle"
        ? isMdOrAdmin
          ? PUZZLE_ONBOARDING_STEPS_MD
          : PUZZLE_ONBOARDING_STEPS
        : isMdOrAdmin
          ? SHARE_ONBOARDING_STEPS_MD
          : SHARE_ONBOARDING_STEPS;
    const visibleCompactTip =
      currentTab === "puzzle" || currentTab === "share"
        ? compactTipContent[currentTab]
        : null;

    return (
      <>
        <div className="flex flex-col">
          {/* 탭 (깃발 / 조각) — 자세히로 갈 때도 그대로 전달 */}
          <div className="flex items-center gap-2 -mx-4 px-4 mb-2">
            <button
              type="button"
              onClick={() => handleTabChange("puzzle")}
              className={`text-[13px] font-bold px-3 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${
                currentTab === "puzzle"
                  ? "bg-amber-500 text-black"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
            >
              <span className="text-[18px] leading-none">🚩</span> 깃발
            </button>
            {showShareTab && (
              <button
                type="button"
                onClick={() => handleTabChange("share")}
                className={`text-[13px] font-bold px-3 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${
                  currentTab === "share"
                    ? "bg-amber-500 text-black"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                <span className="text-[16px] leading-none">🧩</span> 조각
              </button>
            )}
            <Link
              href={detailHref(currentTab)}
              className="ml-auto text-[11px] text-neutral-500 hover:text-white font-bold inline-flex items-end gap-0.5 pb-0.5 self-end"
            >
              더보기
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {/* 첫 진입 인라인 가이드 — 캐러셀 위 (한번 닫으면 영구 숨김) */}
          {showTopGuide && (currentTab === "puzzle" || currentTab === "share") && (
            <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-4 relative mt-4 mb-4">
              <button
                onClick={dismissTopGuide}
                aria-label="가이드 닫기"
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-neutral-500 hover:text-white transition-colors z-10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <span className="absolute -top-2 left-3 text-[10px] font-black text-black bg-amber-500 px-1.5 py-0.5 rounded-full shadow-sm leading-none z-10">
                ⓘ 이용방법
              </span>
              <div className="flex flex-col gap-2">
                {compactSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="bg-neutral-800/80 border border-neutral-700 rounded-2xl p-3 flex flex-row items-center gap-3"
                  >
                    <div className={`w-11 h-11 rounded-xl ${step.color} flex items-center justify-center shrink-0`}>
                      {step.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[14.5px] font-black text-white mb-0.5 break-keep">{step.title}</h3>
                      <p className={`text-[12px] text-neutral-400 font-medium break-keep whitespace-pre-line ${idx === 1 ? "leading-relaxed" : "leading-snug"}`}>
                        {step.desc.split("\n").map((line, lineIdx, arr) => {
                          const parts = line.split(/(\*\*[^*]+\*\*)/g);
                          return (
                            <span key={lineIdx}>
                              {parts.map((part, pIdx) =>
                                /^\*\*[^*]+\*\*$/.test(part) ? (
                                  <span key={pIdx} className="text-neutral-200 font-semibold">
                                    {part.slice(2, -2)}
                                  </span>
                                ) : (
                                  <span key={pIdx}>{part}</span>
                                )
                              )}
                              {lineIdx < arr.length - 1 && "\n"}
                            </span>
                          );
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 깃발 / 조각 캐러셀 */}
          <div className="mb-3">
            {currentTab === "puzzle" && (
              <HomePuzzleCarousel
                puzzles={visiblePuzzles}
                offerCounts={puzzleOfferCounts}
                userRole={user?.role as "user" | "md" | "admin" | undefined}
                detailHref={detailHref("puzzle")}
                newFlagHref={newFlagHref}
                showFlagCTA
              />
            )}
            {currentTab === "share" && (
              <HomeShareCarousel
                shares={visibleAuctions.filter((a) => a.listing_type === "share")}
                currentUserId={user?.id}
                detailHref={detailHref("share")}
                newFlagHref={newFlagHref}
                userRole={user?.role as "user" | "md" | "admin" | undefined}
              />
            )}
          </div>

          {/* Tip 박스 + 이용방법 토글 — 캐러셀 아래로 이동 (톤 다운) */}
          {visibleCompactTip && (
            <section className="space-y-2 -mt-1 mb-5">
              {!showGuide && (
                <div
                  ref={tipBoxRef}
                  data-no-pull-refresh
                  className={`relative bg-neutral-900 border-amber-400/50 rounded-xl px-3 [border-width:0.5px] ${showTopGuide ? "" : "pr-16"} ${recentMatchedPuzzle ? "pt-3 pb-4" : "pt-1.5 pb-1"}`}
                >
                  <span className="absolute -top-2 left-3 text-[9px] font-black text-black bg-amber-400 px-1.5 py-0.5 rounded-full leading-none shadow-sm">Tip</span>
                  {recentMatchedPuzzle ? (
                    <div
                      ref={tipContainerRef}
                      className="overflow-hidden select-none"
                      style={{ touchAction: "pan-y" }}
                      onPointerDown={(e) => {
                        const width = tipContainerRef.current?.offsetWidth ?? 0;
                        tipSwipeRef.current = { startX: e.clientX, startY: e.clientY, active: true, width };
                        setTipIsDragging(true);
                        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        const ref = tipSwipeRef.current;
                        if (!ref?.active) return;
                        const dx = e.clientX - ref.startX;
                        const dy = e.clientY - ref.startY;
                        if (Math.abs(dx) <= Math.abs(dy)) return;
                        // 가로 드래그 확정 → 페이지 스크롤 방지
                        e.preventDefault();
                        const widthPct = ref.width > 0 ? (dx / ref.width) * 100 : 0;
                        // tipRotation=0이면 왼쪽 드래그(-100)만 허용, 오른쪽은 0까지
                        // tipRotation=1이면 오른쪽 드래그(+100)만 허용, 왼쪽은 0까지
                        const minOffset = tipRotation === 0 ? -100 : 0;
                        const maxOffset = tipRotation === 0 ? 0 : 100;
                        const offsetPct = Math.max(minOffset, Math.min(maxOffset, widthPct));
                        setTipDragOffset(offsetPct);
                      }}
                      onPointerUp={(e) => {
                        const ref = tipSwipeRef.current;
                        if (!ref?.active) { setTipIsDragging(false); return; }
                        const dx = e.clientX - ref.startX;
                        const dy = e.clientY - ref.startY;
                        tipSwipeRef.current = null;
                        setTipIsDragging(false);
                        setTipDragOffset(0);
                        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
                          if (dx < 0 && tipRotation === 0) changeTipRotation(1);
                          else if (dx > 0 && tipRotation === 1) changeTipRotation(0);
                        }
                      }}
                      onPointerCancel={() => {
                        tipSwipeRef.current = null;
                        setTipIsDragging(false);
                        setTipDragOffset(0);
                      }}
                    >
                      <div
                        className="flex w-full"
                        style={{
                          transform: `translateX(calc(-${tipRotation * 100}% + ${tipDragOffset}%))`,
                          transition: tipIsDragging ? "none" : "transform 400ms cubic-bezier(0.32, 0.72, 0, 1)",
                          willChange: "transform",
                        }}
                      >
                        <div className="w-full shrink-0 text-[13.5px] text-neutral-100 font-bold leading-snug whitespace-pre-line break-keep">
                          {visibleCompactTip}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowMatchedModal(true)}
                          className="w-full shrink-0 text-[13.5px] text-neutral-100 font-bold leading-snug break-keep text-left inline-flex items-center gap-1 hover:text-white transition-colors"
                        >
                          어떤 오퍼 받았는지 엿보기 👈
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[13.5px] text-neutral-100 font-bold leading-snug whitespace-pre-line break-keep">
                      {visibleCompactTip}
                    </div>
                  )}
                  {recentMatchedPuzzle && (
                    <div className="absolute left-0 right-0 bottom-0.5 flex items-center justify-center gap-1 pointer-events-none">
                      {[0, 1].map((i) => (
                        <button
                          key={i}
                          type="button"
                          aria-label={`슬라이드 ${i + 1}`}
                          onClick={(e) => { e.stopPropagation(); changeTipRotation(i); }}
                          className="pointer-events-auto p-1 cursor-pointer"
                        >
                          <span
                            className={`block w-1.5 h-1.5 rounded-full transition-colors ${
                              tipRotation === i ? "bg-amber-400" : "bg-neutral-600"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  {!showTopGuide && (
                    <button
                      type="button"
                      onClick={() => { setGuideMode("full"); setShowGuide(v => !v); }}
                      className="absolute bottom-1.5 right-2 inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-200/70 hover:text-white transition-colors"
                    >
                      <span className="text-[10.5px] leading-none">ⓘ</span>
                      이용방법
                    </button>
                  )}
                </div>
              )}
              {showGuide && (
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-4 relative">
                  <button
                    onClick={dismissGuide}
                    aria-label="가이드 닫기"
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-neutral-500 hover:text-white transition-colors z-10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  {currentTab === "puzzle" && !isMdOrAdmin && (
                    <span className="absolute bottom-4 right-4 text-[10px] font-black text-emerald-400 bg-[#1C1C1E] border border-emerald-500/50 px-2 py-1 rounded-tl-xl rounded-br-2xl rounded-tr-none rounded-bl-none leading-none z-10">
                      모든 서비스 무료
                    </span>
                  )}
                  <span className="absolute -top-2 left-3 text-[10px] font-black text-black bg-amber-500 px-1.5 py-0.5 rounded-full shadow-sm leading-none z-10">
                    ⓘ 이용방법
                  </span>
                  <div className="flex flex-col gap-2">
                    {compactSteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="bg-neutral-800/80 border border-neutral-700 rounded-2xl p-3 flex flex-row items-center gap-3"
                      >
                        <div className={`w-11 h-11 rounded-xl ${step.color} flex items-center justify-center shrink-0`}>
                          {step.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[14.5px] font-black text-white mb-0.5 break-keep">{step.title}</h3>
                          <p className={`text-[12px] text-neutral-400 font-medium break-keep whitespace-pre-line ${idx === 1 ? "leading-relaxed" : "leading-snug"}`}>
                            {step.desc.split("\n").map((line, lineIdx, arr) => {
                              const parts = line.split(/(\*\*[^*]+\*\*)/g);
                              return (
                                <span key={lineIdx}>
                                  {parts.map((part, pIdx) =>
                                    /^\*\*[^*]+\*\*$/.test(part) ? (
                                      <span key={pIdx} className="text-neutral-200 font-semibold">
                                        {part.slice(2, -2)}
                                      </span>
                                    ) : (
                                      <span key={pIdx}>{part}</span>
                                    )
                                  )}
                                  {lineIdx < arr.length - 1 && "\n"}
                                </span>
                              );
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 비로그인 유저 깃발 CTA는 HomePuzzleCarousel 마지막 카드로 통합됨 */}
        </div>

        {/* 오늘 어디갈래? + HOT DEAL 섹션 + 이하 전체 배경 */}
        {/* pb는 <main>의 pb-16(BottomNav 가림 방지)과 별개로, 섹션 끝과 푸터 사이 최소 간격만. */}
        <div className="-mx-4 px-4 pt-3 pb-6 bg-[#1A1A1E]">
          <ClubBenefitSection />
          {/* MD 전용 게스트 간판 행동 유도 CTA — 일반 유저에겐 null이라 래퍼도 렌더 안 함 */}
          {isMdOrAdmin && (
            <div className="mt-3">
              <GuestSignMdCta />
            </div>
          )}
          <div className="mt-6">
            <HotdealHomeSection />
          </div>
          {/* MD 전용 행동 유도 CTA (오늘 어디갈래? ↔ Hot Deal Tonight 사이) */}
          {isMdOrAdmin && (
            <div className="mt-3">
              <HotdealMdCta />
            </div>
          )}
        </div>

        {/* MD 파트너 승인 축하 Sheet, 깃발 CTA Sheet는 풀 모드와 공유 */}
        {renderHomeSheets()}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col">

        {/* 홈 상단 ClubStrip 일시 숨김 — 핵심 가치 경험(깃발/조각) 흐름을 가리는 노이즈로 판단. /clubs 페이지에선 정상 노출. */}
        {/* <ClubStrip clubs={clubs} /> */}

        {(() => {
          const isMdOrAdmin = user?.role === "md" || user?.role === "admin";
          const steps = currentTab === "puzzle"
            ? (isMdOrAdmin ? PUZZLE_ONBOARDING_STEPS_MD : PUZZLE_ONBOARDING_STEPS)
            : currentTab === "advance"
            ? EARLYBIRD_ONBOARDING_STEPS
            : currentTab === "share"
            ? (isMdOrAdmin ? SHARE_ONBOARDING_STEPS_MD : SHARE_ONBOARDING_STEPS)
            : ONBOARDING_STEPS;
          // MD 전용 puzzle tip
          const mdPuzzleTipContent = (
            <>
              <div className="text-[14.5px]">유저들의 예산이 기다리고 있어요 💰</div>
              <div className="text-[15.5px]">시크릿오퍼로 매출을 올려봐요!</div>
            </>
          );
          const userPuzzleTipContent = (
            <div className="text-[14.5px] text-white">
              오퍼 먼저 받아보고, 별로면 패스해도 <span className="text-amber-300 font-black">OK!</span>
            </div>
          );
          const overriddenTabPromises = isMdOrAdmin
            ? {
                ...TAB_PROMISES_MD,
                puzzle: { ...TAB_PROMISES_MD.puzzle, content: mdPuzzleTipContent },
              }
            : {
                ...TAB_PROMISES,
                puzzle: { ...TAB_PROMISES.puzzle, content: userPuzzleTipContent },
              };
          const visibleSteps = steps;
          const guideCard = (
            <section className="space-y-2 -mx-2 mb-3">
              {/* TIP 박스 — 항시 노출 */}
              {overriddenTabPromises[currentTab]?.content && (
                <div className="relative bg-gradient-to-br from-amber-400/25 via-amber-500/15 to-yellow-600/10 rounded-2xl px-4 pt-4 pb-2.5">
                  <span className="absolute -top-2.5 left-3 text-[11px] font-black text-black bg-amber-500 px-2 py-0.5 rounded-full shadow-sm">Tip</span>
                  <div className="text-[13.5px] text-white font-bold leading-tight whitespace-pre-line break-keep [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                    {overriddenTabPromises[currentTab].content}
                  </div>
                  {(currentTab === "puzzle" || currentTab === "share" || currentTab === "advance") && (
                    <button
                      type="button"
                      onClick={() => { setGuideMode("full"); setShowGuide(v => !v); }}
                      className="absolute bottom-1.5 right-2 inline-flex items-center gap-0.5 text-[10.5px] font-bold text-amber-200/90 hover:text-white transition-colors"
                    >
                      <span className="text-[11px] leading-none">ⓘ</span>
                      이용방법
                    </button>
                  )}
                </div>
              )}
              {/* 이용방법 가이드 — "ⓘ 이용방법" 클릭 시 토글 */}
              {showGuide && (
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-4 relative">
                  <button
                    onClick={dismissGuide}
                    aria-label="가이드 닫기"
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-neutral-500 hover:text-white transition-colors z-10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  {currentTab === "puzzle" && !isMdOrAdmin && (
                    <span className="absolute bottom-4 right-4 text-[10px] font-black text-emerald-400 bg-[#1C1C1E] border border-emerald-500/50 px-2 py-1 rounded-tl-xl rounded-br-2xl rounded-tr-none rounded-bl-none leading-none z-10">
                      모든 서비스 무료
                    </span>
                  )}
                  <span className="absolute -top-2 left-3 text-[10px] font-black text-black bg-amber-500 px-1.5 py-0.5 rounded-full shadow-sm leading-none z-10">
                    ⓘ 이용방법
                  </span>
                  <div className="flex flex-col gap-2">
                    {visibleSteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="bg-neutral-800/80 border border-neutral-700 rounded-2xl p-3 flex flex-row items-center gap-3 cursor-default"
                      >
                        <div className={`w-11 h-11 rounded-xl ${step.color} flex items-center justify-center shrink-0`}>
                          {step.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[14.5px] font-black text-white mb-0.5 break-keep">{step.title}</h3>
                          <p className={`text-[12px] text-neutral-400 font-medium break-keep whitespace-pre-line ${idx === 1 ? "leading-relaxed" : "leading-snug"}`}>
                            {step.desc.split("\n").map((line, lineIdx, arr) => {
                              const parts = line.split(/(\*\*[^*]+\*\*)/g);
                              return (
                                <span key={lineIdx}>
                                  {parts.map((part, pIdx) =>
                                    /^\*\*[^*]+\*\*$/.test(part) ? (
                                      <span key={pIdx} className="text-neutral-200 font-semibold">
                                        {part.slice(2, -2)}
                                      </span>
                                    ) : (
                                      <span key={pIdx}>{part}</span>
                                    )
                                  )}
                                  {lineIdx < arr.length - 1 && "\n"}
                                </span>
                              );
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
          return (
            <AuctionList
              activeAuctions={visibleAuctions}
              puzzles={visiblePuzzles}
              puzzleOfferCounts={puzzleOfferCounts}
              selectedArea={selectedArea}
              onAreaChange={setSelectedArea}
              userBidMap={userBidMap}
              userInterestedSet={userInterestedSet}
              userRole={user?.role as "user" | "md" | "admin" | undefined}
              currentUserId={user?.id}
              initialTab={currentTab}
              onTabChange={handleTabChange}
              onShowGuide={() => {
                setGuideMode("full");
                setShowGuide(v => !(v && guideMode === "full"));
              }}
              tabPromises={overriddenTabPromises}
              guideSlot={guideCard}
              onBack={() => router.push(`/?tab=${currentTab}`)}
            />
          );
        })()}


        {!isLoading && !(currentTab === "puzzle" && puzzles.length === 0) && currentTab !== "share" && (currentTab === "puzzle" || !user) && (auctions.active.length > 0 || currentTab === "puzzle") && (
          <div className="text-center -mt-20 pb-3 relative z-10">
            <p className="text-[14.5px] text-neutral-200 font-semibold mb-1">
              {currentTab === "puzzle"
                ? "최고의 테이블을 잡으세요."
                : "3초만에 로그인하고 입찰하기"}
            </p>
            <Link href={currentTab === "puzzle" ? (user ? "/flags/new" : "/login?redirect=/flags/new") : "/login"}>
              <Button
                className={
                  currentTab === "puzzle"
                    ? "h-10 px-8 bg-amber-500 text-black font-bold text-sm rounded-full hover:bg-amber-400"
                    : "h-10 px-8 bg-white text-black font-bold text-sm rounded-full hover:bg-neutral-200"
                }
              >
                {currentTab === "puzzle" ? "⛳ 깃발꽂기" : "로그인"}
              </Button>
            </Link>
            {currentTab === "puzzle" && (
              <p className="text-[10px] text-neutral-600 mt-2">
                모든 서비스 무료
              </p>
            )}
          </div>
        )}
      </div>

      {renderHomeSheets()}
    </>
  );
}
