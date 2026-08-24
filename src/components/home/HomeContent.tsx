"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuctionList } from "@/components/auctions/AuctionList";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CheckCircle2, X, PartyPopper, ChevronRight, ArrowDown } from "lucide-react";
import type { Auction, Puzzle } from "@/types/database";
import { ClubStrip } from "@/components/home/ClubStrip";
import { isAuctionExpired } from "@/lib/utils/auction";
import { MAIN_AREAS } from "@/lib/constants/areas";
import { closeExpiredAuctions } from "@/lib/utils/closeExpiredAuction";
import { isInstantEnabled } from "@/lib/features";
import { trackEvent, trackShareEvent } from "@/lib/analytics/events";
import { getBrowserKind, isIOS, isAndroid } from "@/lib/utils/browser";
import { adjustMockAuctionDates } from "@/lib/utils/mockDates";
import { getPublicIncludes } from "@/lib/utils/liquor";
import { HomePuzzleCarousel } from "@/components/home/HomePuzzleCarousel";
import { HomeShareCarousel } from "@/components/home/HomeShareCarousel";
import { ShotCarousel } from "@/components/chat/ShotCarousel";
import { ClubBenefitSection } from "@/components/home/ClubBenefitSection";
import { GuestSignMdCta } from "@/components/home/GuestSignMdCta";
import { FlagOnboardingSheet } from "@/components/home/FlagOnboardingSheet";
import { PartyOnboardingSheet } from "@/components/home/PartyOnboardingSheet";
import { OfferCreditGuideSheet } from "@/components/md/OfferCreditGuideSheet";

const FLAG_CTA_SHOWN_KEY = "nightflow_flag_onboarding_v1";

const ONBOARDING_STEPS = [
  {
    title: "1. 테이블 선택",
    desc: "오늘특가 중 원하는 클럽·테이블을 찾아보세요.",
    icon: <span className="text-[20px]">🔥</span>,
    color: "bg-amber-500/10",
  },
  {
    title: "2. 파트너 연락",
    desc: "예약하기 버튼을 눌러 담당 파트너에게 연락하세요.",
    icon: <span className="text-[20px]">💬</span>,
    color: "bg-emerald-500/10",
  },
  {
    title: "3. 예약 확정",
    desc: "파트너의 안내에 따라 예약하면 끝!",
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
    desc: "1등으로 낙찰되면, 파트너에게 연락해 예약을 확정받아요.",
    icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
    color: "bg-blue-500/10",
  },
];

export const PUZZLE_ONBOARDING_STEPS = [
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
    title: "3. 고르기",
    desc: "마음에 드는 오퍼와 채팅하고\n부담 없이 상담받아봐요!",
    icon: <span className="text-[20px]">🤝</span>,
    color: "bg-rose-500/10",
  },
];

// 유저용 "시크릿오퍼란?" 설명 (3-포인트 + 감성 마무리)
const SECRET_OFFER_INTRO_USER = {
  title: "시크릿오퍼",
  points: [
    "오퍼는 방장에게만 공개돼요",
    "파트너끼리도 서로 내용을 못 봐요",
    "오직 클럽명 + 조건으로 승부",
  ],
  highlights: [
    { emoji: "✨", text: "눈치보지 않는 경쟁으로 혜택 UP" },
    { emoji: "🎁", text: "최고의 오퍼를 택하는 즐거움!" },
  ],
};

// 유저용 조각 이용방법 (등록 → 오퍼 → 선택·예약)
export const SHARE_ONBOARDING_STEPS = [
  {
    title: "1. 파티 등록",
    desc: "파티를 등록하면\n관심있는 친구들이 채팅방에 합류해요!",
    icon: <span className="text-[20px]">🎉</span>,
    color: "bg-green-500/15",
  },
  {
    title: "2. 오퍼 받기",
    desc: "선택한 지역 클럽들이 오퍼를 보내요.\n→ 오퍼는 파티원끼리 함께 봐요\n→ **100% 맞춤 패키지!**",
    icon: <span className="text-[20px]">💌</span>,
    color: "bg-sky-500/15",
  },
  {
    title: "3. 선택하고 예약",
    desc: "마음에 드는 클럽을 채팅방에 초대하고\n상담, 예약하면 끝!",
    icon: <span className="text-[20px]">🤝</span>,
    color: "bg-violet-500/15",
  },
];

// MD 전용 조각 이용방법
export const SHARE_ONBOARDING_STEPS_MD = [
  {
    title: "1. 파티 등록",
    desc: "테이블·인원·가격을 입력하면\n링크 하나로 끝!",
    icon: <span className="text-[20px]">🎉</span>,
    color: "bg-green-500/10",
  },
  {
    title: "2. 공유 & 모집",
    desc: "유저들이 파티를 골라\n오픈채팅방에 모여요.",
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

export const PUZZLE_ONBOARDING_STEPS_MD = [
  {
    title: "1. 입맛 다시기",
    desc: "유저들이 올린 퍼즐/깃발을 살펴봐요.\n예산·인원·날짜 한눈에 확인!",
    icon: <span className="text-[20px]">🍰</span>,
    color: "bg-amber-500/10",
  },
  {
    title: "2. 시크릿오퍼 제안",
    desc: "🔒 다른 파트너에겐 공개되지 않아요 (가격 눈치 X)\n🤫 인스타·연락처 비공개\n👁 깃발은 방장만, 파티는 파티원까지 봐요\n⚔️ 오직 클럽명 + 조건으로 승부!",
    icon: <span className="text-[20px]">✉️</span>,
    color: "bg-emerald-500/10",
  },
  {
    title: "3. 예약 확정하기",
    desc: "선택된 파트너님의 연락처만 공개돼요.",
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
        퍼즐이 다 모이면 <span className="text-brand-amber">깃발</span>로 승격!
        <br />
        깃발에는 파트너들이 시크릿오퍼
        <br />
        <span className="text-emerald-400">가격·패키지 비교하고 골라요.</span>
      </>
    ),
  },
  share: {
    content: (
      <>
        <div className="text-[15.5px] text-foreground">예산은 있는데, 인원이 모자라다면?</div>
        <div className="text-[15.5px] text-foreground">클릭 한 번으로 파티 참가!</div>
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
    note: "💰 수수료 0% · 파트너 직접 수령",
  },
  puzzle: {
    // content는 HomeContent 내부에서 JSX로 재정의 (시크릿오퍼란? 버튼 포함)
    content: "유저들의 예산이 기다리고 있어요 💰",
    note: "💰 제안 무료 · 매칭 시 직접 거래",
  },
  share: {
    content: (
      <>
        <div className="text-[15.5px] text-foreground">이번주 파티를 미리 올려보세요!</div>
        <div className="text-[15.5px] text-foreground">링크 하나로 공유, 인원관리도 간편해요!</div>
      </>
    ),
    note: "🎉 수수료 0% · 현장 직접 수령",
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
  // 조각 섹션 전용 지역 필터 — 깃발(selectedArea)과 독립적으로 움직임
  const [selectedShareArea, setSelectedShareArea] = useState<string | null>(null);
  // 섹션 헤더 옆 날짜 — 캐러셀이 스크롤에 맞춰 "현재 맨 앞 카드 날짜"를 올려준다. (깃발 캐러셀 제거로 puzzleHeaderDate는 삭제)
  const [shareHeaderDate, setShareHeaderDate] = useState<string | null>(null);
  // 가이드는 항상 닫힘 상태로 시작. "ⓘ 깃발 이용 방법" 버튼으로만 펼침.
  const [showGuide, setShowGuide] = useState(false);
  // 가이드 모드는 단일 (full만) — 시크릿오퍼는 PUZZLE_ONBOARDING_STEPS 2단계에 통합됨
  const [guideMode, setGuideMode] = useState<"full">("full");
  // 첫 방문 시 캐러셀 위 인라인 가이드 — 깃발 캐러셀 제거로 항상 false 고정 (닫기 로직 없음)
  const showTopGuide = false;
  /** 더보기 화면의 "이용방법" — 첫 방문 모달을 수동으로 연다 */
  const [flagGuideOpen, setFlagGuideOpen] = useState(false);

  // 홈 랜딩 이벤트 — 세션→깃발 전환율 퍼널 1단계.
  // 마운트 1회만 발동. StrictMode dev double-invoke는 GA4/Mixpanel 중복이지만 raw 로그 분석엔 무해.
  useEffect(() => {
    trackEvent("home_view");
  }, []);

  // 앱 피드백 인게이지먼트: 홈 피드를 일정 깊이 스크롤 = +1 (세션 1회)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => {
      if (window.scrollY < 600) return;
      window.removeEventListener("scroll", onScroll);
      import("@/lib/utils/appFeedbackEngagement").then((m) =>
        m.bumpFeedbackEngagement(1, "home-scroll")
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 브라우저 종류 감지 — 인스타/페북/라인 인앱 유입 전환율 분석용.
  // 세션당 1회만 발동 (sessionStorage로 중복 방지). 유저 UX 영향 없음.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SENT_KEY = "nf_in_app_detected_sent";
    try {
      if (sessionStorage.getItem(SENT_KEY)) return;
      sessionStorage.setItem(SENT_KEY, "1");
    } catch {
      // sessionStorage 실패해도 1회 정도는 발동해도 무해
    }
    const kind = getBrowserKind();
    trackEvent("in_app_detected", {
      browser_kind: kind,                        // instagram | facebook | line | kakao | other
      is_in_app: kind !== "other",               // 카톡 포함 인앱 여부 (분석 편의)
      is_blocking_in_app: ["instagram", "facebook", "line"].includes(kind),  // OAuth 실패 위험군
      os: isIOS() ? "ios" : isAndroid() ? "android" : "other",
    });
  }, []);

  // Tip 박스 콘텐츠 로테이션 (기본 메시지 ↔ 매치 오퍼 보기)
  const [tipRotation, setTipRotation] = useState(0);
  const [tipResetKey, setTipResetKey] = useState(0);
  const [tipDragOffset, setTipDragOffset] = useState(0);
  const [tipIsDragging, setTipIsDragging] = useState(false);
  const tipContainerRef = useRef<HTMLDivElement>(null);
  const tipSwipeRef = useRef<{ startX: number; startY: number; active: boolean; width: number } | null>(null);
  useEffect(() => {
    const id = setInterval(() => setTipRotation((v) => (v + 1) % 3), 5000);
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

  // 매치 깃발 리뷰 자동 시트는 제거됨 (2026-08-04).
  // 중복 방지가 sessionStorage뿐이라 앱을 새로 켤 때마다(=세션마다) 다시 떴고,
  // "다음에 할게요"가 아무것도 영구 기록하지 않아 리뷰를 쓰기 전까지 무한 반복이었음.
  // 리뷰 수집은 알림톡 링크(/puzzles/[id]/review)와 만료 깃발 방문 확인
  // (VisitConfirmTrigger, layout에 전역 마운트)으로만 받는다.
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

  // 첫 방문 시 가이드 자동 표시 제거 — 사용자가 "ⓘ 이용방법" 버튼을 직접 눌렀을 때만 노출

  const instantEnabled = isInstantEnabled();
  const advanceCount = activeAuctions.filter(a => a.listing_type === 'auction').length;
  const shareCount = activeAuctions.filter(a => a.listing_type === 'share').length;
  const isMdOrAdminUser = user?.role === "md" || user?.role === "admin";
  // 조각 탭 노출 조건: MD/Admin은 항상, 일반/비로그인은 조각이 1개 이상일 때만
  // 조각은 유저 주도 기능 → 조각 올리기 진입점을 상시 노출 (0개여도 빈 상태 CTA 표시).
  // shareCount는 유지(향후 조건 재도입/로깅 대비). 길이값이라 항상 true.
  const showShareTab = isMdOrAdminUser || shareCount >= 0;

  // MD 로그인 시 깃발 지역 필터 기본값을 본인 활동 지역으로 1회 자동 선택.
  // (MAIN_AREAS = 강남/홍대/이태원/대구/부산 칩만 제공하므로 그 안에 드는 첫 지역만 적용)
  const areaDefaultApplied = useRef(false);
  useEffect(() => {
    if (areaDefaultApplied.current) return;
    if (!isMdOrAdminUser) return;
    const mine = (user?.area ?? []).find((a) =>
      (MAIN_AREAS as readonly string[]).includes(a)
    );
    if (mine) {
      setSelectedArea(mine);
      areaDefaultApplied.current = true;
    }
  }, [isMdOrAdminUser, user?.area]);
  const normalizeTab = (t: string | null): "today" | "advance" | "puzzle" | "share" => {
    if (t === "today" && instantEnabled) return "today";
    if (t === "advance") return "advance";
    if (t === "puzzle") return "puzzle";
    // share는 폴백 없이 그대로 — "조각 더보기"(?tab=share)로 진입 시 깃발로 강등되면 안 됨.
    // 조각 탭 가시성은 compact의 showShareTab, detail의 canShowShareTab이 각각 제어.
    if (t === "share") return "share";
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

  // (구) 조각 탭 share→puzzle 폴백 제거 — 탭 토글이 세로 2섹션으로 바뀌었고,
  //  "조각 더보기"(?tab=share) 진입 시 깃발로 강등되던 버그 원인이었음.
  //  조각 섹션 가시성은 showShareTab 게이팅, detail은 canShowShareTab이 담당.

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
  // myOfferedPuzzleIds(MD 오퍼한 깃발 ID) 제거 — 깃발 캐러셀 "미제안 우선" 정렬 자체가 삭제됨

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
    // NEW(등록 6시간 이내) 우선 → 오퍼 많은 순 → 이벤트 마감일 빠른 순
    const now = Date.now();
    return [...filtered].sort((a, b) => {
      const aNew = now - new Date(a.created_at).getTime() < 6 * 60 * 60 * 1000 ? 0 : 1;
      const bNew = now - new Date(b.created_at).getTime() < 6 * 60 * 60 * 1000 ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      const aOffers = puzzleOfferCounts[a.id] ?? 0;
      const bOffers = puzzleOfferCounts[b.id] ?? 0;
      if (aOffers !== bOffers) return bOffers - aOffers;
      return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
    });
  }, [puzzles, blockedUserIds, puzzleOfferCounts]);

  // 홈 캐러셀은 항상 전체 노출 (지역 필터 없음 — 더보기에서 바꾼 selectedArea 영향 안 받음).
  // 지역 탐색은 더보기(AuctionList)가 자체 selectedArea로 담당.
  const areaFilteredPuzzles = visiblePuzzles;
  // flagPuzzles(깃발 전용 필터) 제거 — 깃발 캐러셀 자체가 홈에서 빠짐. 파티(조각)만 남음.
  const sharePuzzles = useMemo(() => {
    let shares = areaFilteredPuzzles.filter((p) => p.is_recruiting_party);
    // 홈(캐러셀)은 임박한 것만 — D-7 주간 배치(Migration 505)로 상시 조각이 최대 7일치
    // 미리 발행되므로, 그대로 두면 "지금 갈 수 있는 곳"과 다음 주 자리가 뒤섞인다.
    // 단 컷 대상은 자동 발행분(source_template_id)뿐 — 수동 등록분은 원래 21일 앞까지
    // 홈에 보이던 것이라 건드리지 않는다. 더보기(detail=1)는 전체 기간 그대로.
    if (!isDetailMode) {
      const cap = new Date(Date.now() + 9 * 60 * 60 * 1000 + 2 * 86400000).toISOString().slice(0, 10);
      shares = shares.filter((p) => !p.source_template_id || p.event_date <= cap);
    }
    // 자동 발행분은 NEW 판정을 등록 시각이 아니라 방문일 임박도로 본다.
    // 월요일에 발행된 금요일 자리가 월요일 자정에 NEW가 꺼지고 정작 금요일엔 강조가 없어지는 문제.
    // 수동 등록분(파트너·유저 공통)은 기존대로 등록 6시간 이내.
    const isNew = (p: Puzzle) =>
      p.source_template_id
        ? new Date(p.event_date).getTime() - Date.now() < 2 * 86400000
        : Date.now() - new Date(p.created_at).getTime() < 6 * 60 * 60 * 1000;
    // 1순위: NEW(등록 6시간 이내 / 파트너 직통은 D-1 이내) — NEW끼리는 최근 등록순(최신이 왼쪽)
    // 2순위: 이벤트 날짜 빠른 순
    return [...shares].sort((a, b) => {
      const aNew = isNew(a);
      const bNew = isNew(b);
      if (aNew !== bNew) return aNew ? -1 : 1;
      if (aNew && bNew) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
    });
  }, [areaFilteredPuzzles, isDetailMode]);

  /**
   * "N개 더보기"의 N — 화면에 실제로 깔리는 카드 수.
   * 파트너 조각은 클럽×날짜로 한 장에 묶이므로(ClubDirectCard) 건수로 세면
   * 카드 2장인데 15개라고 적히는 일이 생긴다.
   */
  const shareCardCount = useMemo(() => {
    const clubKeys = new Set<string>();
    let userCount = 0;
    sharePuzzles.forEach((p) => {
      if (p.host_is_md && p.club_id) clubKeys.add(`${p.club_id}|${p.event_date}`);
      else userCount += 1;
    });
    return clubKeys.size + userCount;
  }, [sharePuzzles]);

  const areaFilteredShares = useMemo(
    () => visibleAuctions.filter((a) => a.listing_type === "share"),
    [visibleAuctions]
  );

  // 캐러셀(최대 3개) 선발 — 슬롯 규칙은 로그인 상태와 무관하게 동일.
  //   1~2번 칸: NEW(6시간 이내) 우선 → 이벤트 날짜 가까운 순  ← 신규 깃발 발견 보장
  //   3번 칸  : 오퍼 최다 1개                                ← "꽂으면 제안 온다" 소셜 프루프
  // MD/Admin만 각 후보군 안에서 tie-break 추가:
  // 깃발 캐러셀 3칸 선발 알고리즘(carouselPuzzles) 제거 — 깃발 캐러셀 자체가 홈에서 빠짐.

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
      {/* 깃발 사용법 온보딩 — 비로그인 첫 방문 시 1회 자동 노출 (localStorage) */}
      {/* 자동 노출 비활성화 — 깃발 신규 진입점 숨김 */}
      <FlagOnboardingSheet autoShow={false} />
      {/* 최근 매치 깃발 모달 */}
      <Sheet open={showMatchedModal} onOpenChange={setShowMatchedModal}>
        <SheetContent
          side="bottom"
          className="h-auto bg-background border-border rounded-t-3xl px-5 pt-5 pb-8 max-h-[80vh] overflow-y-auto gap-2"
        >
          <SheetHeader className="text-left p-0 gap-0 mb-1">
            <SheetTitle className="text-foreground text-[24px] font-black tracking-tight leading-tight">
              😎 이 정도는 받아야죠
            </SheetTitle>
          </SheetHeader>
          {recentMatchedPuzzle && (
            <div className="space-y-3">
              <div className="bg-card rounded-2xl border border-border p-4 space-y-2 relative">
                <span className="absolute top-3 right-3 text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full leading-none">
                  성사됨
                </span>
                <div>
                  <p className="text-[14px] font-medium text-muted-foreground break-keep">
                    {recentMatchedPuzzle.notes || `${recentMatchedPuzzle.area}에서 모여요`}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                    {recentMatchedPuzzle.area} · {recentMatchedPuzzle.target_count}명
                  </p>
                </div>
                <div className="text-[20px] font-black text-money tracking-tight">
                  예산 {(recentMatchedPuzzle.total_budget ?? recentMatchedPuzzle.budget_per_person * recentMatchedPuzzle.target_count).toLocaleString()}원
                </div>
                {recentMatchedPuzzle.club_name && (
                  <div className="pt-2 border-t border-border space-y-1.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-[17px] font-black text-brand-amber tracking-tight">{recentMatchedPuzzle.club_name}</p>
                      {recentMatchedPuzzle.md_instagram && (
                        <p className="text-[11.5px] text-muted-foreground font-medium">
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
                                  className="text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-brand-amber border border-amber-500/30"
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
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-card text-muted-foreground border border-border"
                                >
                                  {ext}
                                </span>
                              ))}
                            </div>
                          )}
                          {recentMatchedPuzzle.offer_comment && (
                            <p className="text-[12px] text-foreground/80 italic leading-snug pt-1">
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
              <div className="flex items-center justify-center gap-2 px-4 py-0 -mt-2 mb-1">
                <span className="text-[22px] leading-none">🎉</span>
                <p className="text-[18px] font-black text-brand-amber leading-snug break-keep text-center tracking-tight">
                  <span className="text-shimmer-gold">
                    당일 예약보다
                  </span>{" "}
                  <span className="text-brand-amber">30만원치 더</span> 받았어요
                </p>
              </div>
              {/* 깃발 신규 생성 CTA 제거 — 매치 쇼케이스는 계속 노출되지만 진입점은 없음 */}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* MD 파트너 승인 축하 Sheet (최초 1회) */}
      <Sheet open={showMDWelcome} onOpenChange={(open) => { if (!open) handleDismissMDWelcome(); }}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-auto bg-card border-border rounded-t-3xl px-6 pb-10"
        >
          <SheetHeader className="text-center pt-2">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <PartyPopper className="w-8 h-8 text-brand-amber" />
            </div>
            <SheetTitle className="text-foreground font-black text-2xl">
              축하합니다!
            </SheetTitle>
            <SheetDescription className="text-muted-foreground text-sm leading-relaxed mt-2">
              NightFlow 파트너로 승인되었습니다.
              <br />
              지금 바로 테이블을 등록하고 첫 매출을 만들어보세요.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 mt-6">
            <div className="flex items-center gap-3 bg-card/50 rounded-xl p-3 border border-border/30">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center text-money font-black text-sm shrink-0">1</div>
              <p className="text-[13px] text-foreground/80 font-medium">
                <span className="text-foreground font-bold">주말(공휴일) 테이블</span>을 경매로 올리세요
              </p>
            </div>
            <div className="flex items-center gap-3 bg-card/50 rounded-xl p-3 border border-border/30">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center text-money font-black text-sm shrink-0">2</div>
              <p className="text-[13px] text-foreground/80 font-medium">
                유저들이 실시간으로 <span className="text-foreground font-bold">입찰 경쟁</span>합니다
              </p>
            </div>
            <div className="flex items-center gap-3 bg-card/50 rounded-xl p-3 border border-border/30">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center text-money font-black text-sm shrink-0">3</div>
              <p className="text-[13px] text-foreground/80 font-medium">
                낙찰되면 <span className="text-foreground font-bold">유저가 직접 연락</span>드려요
              </p>
            </div>
          </div>

          <div className="space-y-3 mt-6">
            <Button
              onClick={handleGoToCreateAuction}
              className="w-full h-14 bg-inverse hover:opacity-90 text-inverse-foreground font-black text-base rounded-2xl transition-all active:scale-[0.98]"
            >
              경매 올리기
            </Button>
            <button
              onClick={handleDismissMDWelcome}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground/80 transition-colors py-2 font-medium"
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
    const newShareHref = user ? "/shares/new" : "/login?redirect=/shares/new";

    // 탭별 Tip 콘텐츠 (풀 화면과 일관)
    const userPuzzleTipContent = (
      <div className="text-[14.5px] text-foreground">
        오퍼 받아보고, 별로면 패스해도 <span className="text-brand-amber font-black">OK!</span>
      </div>
    );
    const mdPuzzleTipContent = (
      <div>유저들의 예산이 기다리고 있어요 💰</div>
    );
    const mdShareTipContent = (
      <>
        <div className="text-foreground">이번주 파티를 미리 올려보세요!</div>
        <div className="text-foreground">링크 하나로 공유, 인원관리도 간편해요!</div>
      </>
    );
    const compactTipContent: Record<"puzzle" | "share", React.ReactNode> = {
      puzzle: isMdOrAdmin ? mdPuzzleTipContent : userPuzzleTipContent,
      share: isMdOrAdmin ? mdShareTipContent : TAB_PROMISES.share.content,
    };
    // 깃발/조각을 세로 2섹션으로 항상 노출. Tip·이용방법 가이드는 깃발 섹션 전용이므로
    // steps/tip을 깃발(puzzle) 기준으로 고정한다. (share용 분기 제거)
    const compactSteps = isMdOrAdmin ? PUZZLE_ONBOARDING_STEPS_MD : PUZZLE_ONBOARDING_STEPS;
    const visibleCompactTip = compactTipContent.puzzle;
    // 팁 슬라이드 index 1 = 매칭오퍼("어떤 오퍼 받을지 궁금해?") — recentMatchedPuzzle 있을 때만
    const compactSlideCount = recentMatchedPuzzle ? 3 : 2;
    const isCompactOfferSlide = !!recentMatchedPuzzle && tipRotation % compactSlideCount === 1;

    // 섹션 헤더 한 줄: [아이콘 버튼] [첫 날짜] ... [더보기]  (홈은 지역 필터 없음 — 탐색은 더보기에서)
    const renderSectionRow = (opts: {
      icon: string;
      label: string;
      detailTab: "puzzle" | "share";
      /** 배지 옆에 표시할 첫 카드 날짜 "6/23(화)" — 없으면 생략 */
      dateLabel?: string | null;
      /** 전체 개수 — "X개 더보기"로 표시 (0/미지정이면 "더보기") */
      count?: number;
    }) => (
      <div className="flex items-center gap-2 -mx-4 px-4 mb-2">
        <Link
          href={detailHref(opts.detailTab)}
          aria-label={`${opts.label} 더보기`}
          className="shrink-0 text-[13px] font-black px-3.5 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 active:scale-95 text-black inline-flex items-center gap-0.5 transition-all"
        >
          <span className="text-[13px] leading-none">{opts.icon}</span> {opts.label}
        </Link>
        {opts.dateLabel && (
          <div className="flex items-center gap-1.5 shrink-0">
            <h3 className="text-[15px] font-black text-foreground tracking-tight">
              {opts.dateLabel}
            </h3>
          </div>
        )}
        <Link
          href={detailHref(opts.detailTab)}
          aria-label={opts.count && opts.count > 0 ? `${opts.count}개 더보기` : "더보기"}
          className="ml-auto -my-1.5 -mr-2 shrink-0 self-center text-[12px] text-muted-foreground hover:text-foreground active:text-foreground font-bold inline-flex items-center gap-0.5 px-2 py-2.5 rounded-lg active:bg-white/5 transition-colors"
        >
          {opts.count && opts.count > 0 ? `${opts.count}개 더보기` : "더보기"}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );


    return (
      <>
        <div className="flex flex-col">
          {/* ── 오늘 어디갈래? — 홈 최상단 고정 배치 ── */}
          <div className="-mx-4 px-4 pb-4">
            <ClubBenefitSection />
            {/* MD 전용 게스트 간판 행동 유도 CTA — 일반 유저에겐 null이라 래퍼도 렌더 안 함 */}
            {isMdOrAdmin && (
              <div className="mt-3">
                <GuestSignMdCta />
              </div>
            )}
          </div>

          {/* ── LIVE — 고정헤더 바로 아래 (핵심: 실시간 클럽 분위기).
                 LIVE 없으면 ShotCarousel이 null 반환 → 섹션·여백 모두 안 보임 (mb 없음) ── */}
          {/* ⚠️ 여기에 음수 margin을 주면 LIVE가 없을 때(ShotCarousel이 null)
              빈 래퍼만 남아 뒤 콘텐츠까지 끌어올려 헤더에 붙는다. */}
          <div className="-mx-4">
            <ShotCarousel
              showComposeButton={false}
              currentUserId={user?.id}
              endCardTo="/chat"
            />
          </div>

          {/* MD 팁박스 — 홈에서 제거 (상세 "더보기"에는 유지). false로 차단 */}
          {false && isMdOrAdmin && visibleCompactTip && (
            <div className="order-1 bg-muted border-amber-400/50 rounded-xl px-3 py-2 mb-2 [border-width:0.5px]">
              <div className="text-[14px] text-foreground font-black leading-snug break-keep"><ArrowDown className="w-3.5 h-3.5 inline-block mr-1 text-brand-amber relative -top-px animate-bounce" />유저들의 예산이 기다리고 있어요</div>
            </div>
          )}

          {/* 유저 팁박스 — 홈에서 제거 (상세 "더보기"에는 유지). false로 차단 */}
          {false && visibleCompactTip && !isMdOrAdmin && (
            <section className="space-y-2 mb-3 order-1">
              {true && (
                <div
                  ref={tipBoxRef}
                  data-no-pull-refresh
                  className={`relative bg-gradient-to-br from-amber-400/10 via-card to-card border border-amber-400/60 shadow-[0_0_0_1px_rgba(251,191,36,0.08),0_4px_16px_-6px_rgba(251,191,36,0.25)] rounded-2xl px-3.5 ${(showTopGuide || showGuide || isCompactOfferSlide) ? "" : "pr-[88px]"} ${recentMatchedPuzzle ? "pt-3.5 pb-5" : "pt-2.5 pb-2"}`}
                >
                  {(() => {
                    const compactSlides: React.ReactNode[] = [
                      <div key="new" className="text-[14px] text-foreground font-black leading-snug break-keep">예약금 Zero, 수수료 Zero</div>,
                      ...(recentMatchedPuzzle ? [
                        <button
                          key="offer"
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setShowMatchedModal(true); }}
                          className="w-full text-[14px] text-foreground font-black leading-snug break-keep text-left inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          <span className="underline underline-offset-4 decoration-2 decoration-amber-400/70">어떤 오퍼 받을지 궁금해?</span>
                          <span aria-hidden>👈</span>
                        </button>
                      ] : []),
                      <div key="tip" className="text-[14px] text-foreground font-black leading-snug break-keep">{visibleCompactTip}</div>,
                    ];
                    const slideCount = compactSlides.length;
                    const safeRotation = tipRotation % slideCount;
                    return (
                      <>
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
                            e.preventDefault();
                            const widthPct = ref.width > 0 ? (dx / ref.width) * 100 : 0;
                            const minOffset = safeRotation === 0 ? 0 : -100;
                            const maxOffset = safeRotation === slideCount - 1 ? 0 : 100;
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
                              if (dx < 0 && safeRotation < slideCount - 1) changeTipRotation(safeRotation + 1);
                              else if (dx > 0 && safeRotation > 0) changeTipRotation(safeRotation - 1);
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
                              transform: `translateX(calc(-${safeRotation * 100}% + ${tipDragOffset}%))`,
                              transition: tipIsDragging ? "none" : "transform 400ms cubic-bezier(0.32, 0.72, 0, 1)",
                              willChange: "transform",
                            }}
                          >
                            {compactSlides.map((slide, i) => (
                              // 2번(오퍼 버튼) 기준으로 모든 슬라이드 세로 가운데 정렬 + 동일 최소높이
                              <div key={i} className="w-full shrink-0 flex items-center min-h-[22px]">{slide}</div>
                            ))}
                          </div>
                        </div>
                        <div className="absolute left-0 right-0 -bottom-1 flex items-center justify-center gap-0.5 pointer-events-none">
                          {compactSlides.map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              aria-label={`슬라이드 ${i + 1}`}
                              onClick={(e) => { e.stopPropagation(); changeTipRotation(i); }}
                              className="pointer-events-auto p-2.5"
                            >
                              <span className={`block w-2 h-2 rounded-full transition-colors ${safeRotation === i ? "bg-amber-400" : "bg-muted"}`} />
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                  {!showTopGuide && !isCompactOfferSlide && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setGuideMode("full"); setShowGuide(v => !v); }}
                      className="absolute top-1/2 -translate-y-1/2 right-2.5 inline-flex items-center gap-0.5 px-2.5 py-1.5 rounded-full bg-amber-400/15 border border-amber-400/40 text-[10.5px] font-bold text-brand-amber hover:bg-amber-400/25 hover:text-brand-amber active:scale-95 transition-all"
                    >
                      이용방법
                    </button>
                  )}
                </div>
              )}
              {showGuide && (
                <div className="bg-card border border-border rounded-3xl p-4 relative">
                  <button
                    onClick={dismissGuide}
                    aria-label="가이드 닫기"
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex flex-col gap-2">
                    {compactSteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="bg-muted/60 border border-border rounded-2xl p-3 flex flex-row items-center gap-3 relative overflow-hidden"
                      >
                        {idx === 0 && currentTab === "puzzle" && !isMdOrAdmin && (
                          <span className="absolute top-0 right-0 text-[10px] font-black text-emerald-400 bg-card border border-emerald-500/50 px-2 py-1 rounded-tr-2xl rounded-bl-xl rounded-tl-none rounded-br-none leading-none z-10">
                            모든 서비스 무료
                          </span>
                        )}
                        <div className={`w-11 h-11 rounded-xl ${step.color} flex items-center justify-center shrink-0`}>
                          {step.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[14.5px] font-black text-foreground mb-0.5 break-keep">{step.title}</h3>
                          <p className={`text-[12px] text-muted-foreground font-medium break-keep whitespace-pre-line ${idx === 1 ? "leading-relaxed" : "leading-snug"}`}>
                            {step.desc.split("\n").map((line, lineIdx, arr) => {
                              const parts = line.split(/(\*\*[^*]+\*\*)/g);
                              return (
                                <span key={lineIdx}>
                                  {parts.map((part, pIdx) =>
                                    /^\*\*[^*]+\*\*$/.test(part) ? (
                                      <span key={pIdx} className="text-foreground/90 font-semibold">
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
                  {/* 깃발 "🚩 바로가기" CTA 제거 — 깃발 신규 진입점 숨김 */}
                </div>
              )}
            </section>
          )}

          {/* 🚩 깃발 섹션(헤더+인라인 가이드+캐러셀) 제거 — 깃발 신규 진입점 숨김 */}

          {/* ── 파티 섹션 — order-2로 팁박스 아래 배치 ── */}
          <div className="order-2 flex flex-col">
          {showShareTab && (
            <>
              {/* ── 파티 섹션 헤더 한 줄: 버튼 + 지역칩 + 더보기 ── */}
              {renderSectionRow({ icon: "🎉", label: "파티", detailTab: "share", dateLabel: shareHeaderDate, count: shareCardCount })}

              {/* 유저 파티(파티원 모집) 캐러셀 — HomePuzzleCarousel 재사용(shareMode) */}
              <div className="mb-2">
                <HomePuzzleCarousel
                  puzzles={sharePuzzles}
                  totalCount={sharePuzzles.length}
                  offerCounts={puzzleOfferCounts}
                  userRole={user?.role as "user" | "md" | "admin" | undefined}
                  detailHref={detailHref("share")}
                  newFlagHref={newShareHref}
                  showFlagCTA
                  shareMode
                  onActiveDateChange={setShareHeaderDate}
                />
              </div>
            </>
          )}
          </div>

          {/* 비로그인 유저 깃발 CTA는 HomePuzzleCarousel 마지막 카드로 통합됨 */}
        </div>

        {/* 🔥 Hot Deal Tonight 섹션 + MD 유도 CTA 제거 — 핫딜(daily_hotdeals) 폐기.
            게스트 간판("오늘 어디갈래?" = ClubBenefitSection)은 홈 최상단에 그대로 유지된다. */}

        {/* MD 파트너 승인 축하 Sheet, 깃발 CTA Sheet는 풀 모드와 공유 */}
        {renderHomeSheets()}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col">

        {/* 홈 상단 ClubStrip 일시 숨김 — 핵심 가치 경험(깃발/파티) 흐름을 가리는 노이즈로 판단. /clubs 페이지에선 정상 노출. */}
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
            <div className="text-[15.5px]">유저들의 예산이 기다리고 있어요 💰</div>
          );
          const userPuzzleTipContent = (
            <div className="text-[14.5px] text-foreground">
              오퍼 받아보고, 별로면 패스해도 <span className="text-brand-amber font-black">OK!</span>
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
          // 상세 팁 슬라이드 index 1 = 매칭오퍼 슬라이드 — 유저 & 비-share 탭 & recentMatchedPuzzle일 때만
          const detailHasOffer = !isMdOrAdmin && currentTab !== "share" && !!recentMatchedPuzzle;
          const isDetailOfferSlide = detailHasOffer && tipRotation % 3 === 1;
          const guideCard = (
            <section className="space-y-2 -mx-2 mb-3">
              {/* TIP 박스 — 항시 노출 (매치 깃발 있으면 슬라이드) */}
              {overriddenTabPromises[currentTab]?.content && (
                <div className={`relative bg-gradient-to-br from-amber-400/10 via-card to-card border border-amber-400/60 shadow-[0_0_0_1px_rgba(251,191,36,0.08),0_4px_16px_-6px_rgba(251,191,36,0.25)] rounded-2xl px-3.5 pt-2.5 pb-2 ${((currentTab === "puzzle" || currentTab === "advance" || currentTab === "share") && !isDetailOfferSlide) ? "pr-[88px]" : ""}`}>
                  {(() => {
                    // compact와 동일한 3장 슬라이드 — 인트로 + (매치 있으면) "오퍼 궁금해?" + 본문
                    const introText = "예약금 Zero, 수수료 Zero";
                    const detailSlides: React.ReactNode[] = [
                      // 조각 탭은 인트로("오픈채팅으로 찾기 어려우셨다면?") 페이지 제거 — tip 슬라이드만 노출
                      ...(currentTab !== "share" ? [
                        <div key="new" className="text-[15.5px] text-foreground font-black leading-snug break-keep">{introText}</div>,
                      ] : []),
                      ...(!isMdOrAdmin && currentTab !== "share" && recentMatchedPuzzle ? [
                        <button
                          key="offer"
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setShowMatchedModal(true); }}
                          className="w-full text-[15.5px] text-foreground font-black leading-snug break-keep text-left inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          <span className="underline underline-offset-4 decoration-2 decoration-amber-400/70">어떤 오퍼 받을지 궁금해?</span>
                          <span aria-hidden>👈</span>
                        </button>
                      ] : []),
                      // "오퍼 받아보고, 별로면 패스해도 OK!" 슬라이드는 유저용 깃발 탭에서만 제거 (요청: 3페이지만 없애기). 조각/MD 탭은 유지.
                      ...(!(currentTab === "puzzle" && !isMdOrAdmin) ? [
                        <div key="tip" className="text-[15.5px] text-foreground font-black leading-snug whitespace-pre-line break-keep">
                          {overriddenTabPromises[currentTab].content}
                        </div>,
                      ] : []),
                    ];
                    const slideCount = detailSlides.length;
                    const safeRotation = tipRotation % slideCount;
                    return (
                      <>
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
                            e.preventDefault();
                            const widthPct = ref.width > 0 ? (dx / ref.width) * 100 : 0;
                            const minOffset = safeRotation === 0 ? 0 : -100;
                            const maxOffset = safeRotation === slideCount - 1 ? 0 : 100;
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
                              if (dx < 0 && safeRotation < slideCount - 1) changeTipRotation(safeRotation + 1);
                              else if (dx > 0 && safeRotation > 0) changeTipRotation(safeRotation - 1);
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
                              transform: `translateX(calc(-${safeRotation * 100}% + ${tipDragOffset}%))`,
                              transition: tipIsDragging ? "none" : "transform 400ms cubic-bezier(0.32, 0.72, 0, 1)",
                              willChange: "transform",
                            }}
                          >
                            {detailSlides.map((slide, i) => (
                              <div key={i} className="w-full shrink-0">{slide}</div>
                            ))}
                          </div>
                        </div>
                        {slideCount > 1 && (
                          // 박스 전체 폭 기준 중앙정렬 — pr-[88px](이용방법 버튼 공간)을 음수 마진으로 상쇄
                          <div className={`mt-0.5 flex items-center justify-center gap-0.5 ${((currentTab === "puzzle" || currentTab === "advance") && !isDetailOfferSlide) ? "-mr-[88px]" : ""}`}>
                            {detailSlides.map((_, i) => (
                              <button
                                key={i}
                                type="button"
                                aria-label={`슬라이드 ${i + 1}`}
                                onClick={(e) => { e.stopPropagation(); changeTipRotation(i); }}
                                className="px-2.5 py-1.5"
                              >
                                <span className={`block w-2 h-2 rounded-full transition-colors ${safeRotation === i ? "bg-amber-400" : "bg-muted"}`} />
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {(currentTab === "puzzle" || currentTab === "advance" || currentTab === "share") && !isDetailOfferSlide && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFlagGuideOpen(true); }}
                      className="absolute top-1/2 -translate-y-1/2 right-2.5 inline-flex items-center gap-0.5 px-2.5 py-1.5 rounded-full bg-amber-400/15 border border-amber-400/40 text-[10.5px] font-bold text-brand-amber hover:bg-amber-400/25 hover:text-brand-amber active:scale-95 transition-all"
                    >
                      이용방법
                    </button>
                  )}
                </div>
              )}
              {/* 이용방법 — 탭에 맞는 모달을 연다. 깃발(내 조건 올리기)과 파티(열린 자리 합류)는
                  흐름이 달라 같은 설명을 돌려쓰면 자기가 뭘 하는지 헷갈린다.
                  파트너는 보는 각도가 반대다(오퍼를 보내는 쪽) — 상세 첫 진입에서 1회만 뜨고
                  다시 열 길이 없던 파트너 안내를 여기에 붙인다. manualOpen 이라 계정 플래그는
                  소모하지 않는다. */}
              {flagGuideOpen && (
                isMdOrAdminUser ? (
                  <OfferCreditGuideSheet
                    isParty={currentTab === "share"}
                    manualOpen
                    onManualClose={() => setFlagGuideOpen(false)}
                  />
                ) : currentTab === "share" ? (
                  <PartyOnboardingSheet manualOpen onManualClose={() => setFlagGuideOpen(false)} />
                ) : (
                  <FlagOnboardingSheet autoShow={false} manualOpen onManualClose={() => setFlagGuideOpen(false)} />
                )
              )}
              {/* 인라인 가이드(구) — 다른 진입점에서만 사용 */}
              {showGuide && (
                <div className="bg-card border border-border rounded-3xl p-4 relative">
                  <button
                    onClick={dismissGuide}
                    aria-label="가이드 닫기"
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex flex-col gap-2">
                    {visibleSteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="bg-muted/60 border border-border rounded-2xl p-3 flex flex-row items-center gap-3 cursor-default relative overflow-hidden"
                      >
                        {idx === 0 && (currentTab === "puzzle" || currentTab === "share") && !isMdOrAdmin && (
                          <span className="absolute top-0 right-0 text-[10px] font-black text-emerald-400 bg-card border border-emerald-500/50 px-2 py-1 rounded-tr-2xl rounded-bl-xl rounded-tl-none rounded-br-none leading-none z-10">
                            모든 서비스 무료
                          </span>
                        )}
                        <div className={`w-11 h-11 rounded-xl ${step.color} flex items-center justify-center shrink-0`}>
                          {step.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[14.5px] font-black text-foreground mb-0.5 break-keep">{step.title}</h3>
                          <p className={`text-[12px] text-muted-foreground font-medium break-keep whitespace-pre-line ${idx === 1 ? "leading-relaxed" : "leading-snug"}`}>
                            {step.desc.split("\n").map((line, lineIdx, arr) => {
                              const parts = line.split(/(\*\*[^*]+\*\*)/g);
                              return (
                                <span key={lineIdx}>
                                  {parts.map((part, pIdx) =>
                                    /^\*\*[^*]+\*\*$/.test(part) ? (
                                      <span key={pIdx} className="text-foreground/90 font-semibold">
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
                  {/* 깃발 "🚩 바로가기" CTA 제거 — 깃발 신규 진입점 숨김 */}
                  {currentTab === "share" && !isMdOrAdmin && (
                    <div className="flex justify-end mt-3">
                      <Link
                        href={user ? "/shares/new" : "/login?redirect=/shares/new"}
                        onClick={dismissGuide}
                        className="inline-flex items-center gap-1 h-9 px-4 bg-amber-500 hover:bg-amber-400 active:scale-[0.97] text-black font-black text-[13px] rounded-full transition-all"
                      >
                        🎉 바로가기
                      </Link>
                    </div>
                  )}
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
              shareSelectedArea={selectedShareArea}
              onShareAreaChange={setSelectedShareArea}
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


        {/* 깃발 "⛳ 깃발꽂기" 대형 CTA 제거 — 비로그인 로그인 유도만 남김 */}
        {!isLoading && !user && currentTab !== "share" && currentTab !== "puzzle" && auctions.active.length > 0 && (
          <div className="text-center -mt-20 pb-3 relative z-10">
            <p className="text-[14.5px] text-foreground/90 font-semibold mb-1">
              3초만에 로그인하고 입찰하기
            </p>
            <Link href="/login">
              <Button className="h-10 px-8 bg-inverse text-inverse-foreground font-bold text-sm rounded-full hover:opacity-90">
                로그인
              </Button>
            </Link>
          </div>
        )}
      </div>

      {renderHomeSheets()}
    </>
  );
}
