"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuctionList } from "@/components/auctions/AuctionList";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CheckCircle2, X, PartyPopper } from "lucide-react";
import type { Auction, Puzzle } from "@/types/database";
import { isAuctionExpired } from "@/lib/utils/auction";
import { closeExpiredAuctions } from "@/lib/utils/closeExpiredAuction";
import { isInstantEnabled } from "@/lib/features";

const GUIDE_DISMISSED_KEY = "nightflow_guide_dismissed";
const FLAG_CTA_SHOWN_KEY = "nightflow_flag_cta_shown";

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
    title: "1. 예산 등록",
    desc: "날짜·지역·예산을 등록하세요.",
    icon: <span className="text-[20px]">⛳</span>,
    color: "bg-amber-500/10",
  },
  {
    title: "2. MD 제안 받기",
    desc: "MD들이 테이블·주류를 제안하고, 서로 경쟁해요.",
    icon: <span className="text-[20px]">📨</span>,
    color: "bg-emerald-500/10",
  },
  {
    title: "3. 수락 & 예약 확정",
    desc: "최고의 제안을 수락하면 MD와 오픈채팅이 열려요. 예약 확정하면 끝!",
    icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
    color: "bg-blue-500/10",
  },
];

const TAB_PROMISES = {
  today: "지금 비어있는 자리, 한눈에",
  advance: "주말되면 자리 없다구요~\n지금 바로 특가 입찰에 도전!",
  puzzle: "DM으로 예약하는 시대는 끝.\n예산만 등록하면, MD들이 먼저 오퍼를 보내와요!",
} as const;

interface HomeContentProps {
  activeAuctions: Auction[];
  puzzles?: Puzzle[];
  puzzleOfferCounts?: Record<string, number>;
}

export function HomeContent({
  activeAuctions,
  puzzles = [],
  puzzleOfferCounts = {},
}: HomeContentProps) {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [showMDWelcome, setShowMDWelcome] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [showFlagCTA, setShowFlagCTA] = useState(false);

  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const instantEnabled = isInstantEnabled();
  const advanceCount = activeAuctions.filter(a => a.listing_type === 'auction').length;
  const normalizeTab = (t: string | null): "today" | "advance" | "puzzle" => {
    if (t === "today" && instantEnabled) return "today";
    if (t === "advance") return "advance";
    if (t === "puzzle") return "puzzle";
    return advanceCount > 0 ? "advance" : "puzzle";
  };

  // URL에서 탭 상태 읽어오기 (instant off 시 today → puzzle)
  const [currentTab, setCurrentTab] = useState<"today" | "advance" | "puzzle">(() => {
    return normalizeTab(searchParams.get("tab"));
  });

  // 탭 변경 시 URL 업데이트
  const handleTabChange = (tab: "today" | "advance" | "puzzle") => {
    const safe = normalizeTab(tab);
    setCurrentTab(safe);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", safe);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const tab = normalizeTab(searchParams.get("tab"));
    if (tab !== currentTab) setCurrentTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, currentTab]);

  useEffect(() => {
    if (!welcomeDismissed && user?.role === "md" && user?.md_status === "approved" && user?.md_welcome_shown === false) {
      setShowMDWelcome(true);
    }
  }, [user, welcomeDismissed]);

  useEffect(() => {
    if (!isLoading && user?.role === "user") {
      if (!localStorage.getItem(FLAG_CTA_SHOWN_KEY)) {
        setShowFlagCTA(true);
      }
    }
  }, [user, isLoading]);

  const handleDismissFlagCTA = () => {
    localStorage.setItem(FLAG_CTA_SHOWN_KEY, "1");
    setShowFlagCTA(false);
  };

  const handleGoToFlagNew = () => {
    localStorage.setItem(FLAG_CTA_SHOWN_KEY, "1");
    setShowFlagCTA(false);
    router.push("/flags/new");
  };

  const handleDismissMDWelcome = async () => {
    setShowMDWelcome(false);
    setWelcomeDismissed(true);
    if (user) {
      await supabase.from("users").update({ md_welcome_shown: true }).eq("id", user.id);
    }
  };

  const handleGoToDashboard = async () => {
    setShowMDWelcome(false);
    setWelcomeDismissed(true);
    if (user) {
      await supabase.from("users").update({ md_welcome_shown: true }).eq("id", user.id);
    }
    router.push("/md/dashboard");
  };

  const [auctions, setAuctions] = useState({
    active: activeAuctions,
  });

  // 사용자 입찰 상태 (경매별 최고 입찰가)
  const [userBidMap, setUserBidMap] = useState<Map<string, number>>(new Map());

  // 사용자 오늘특가 관심 등록 상태
  const [userInterestedSet, setUserInterestedSet] = useState<Set<string>>(new Set());

  // 유저 관심/입찰 병렬 fetch (Promise.all 로 RTT 절반 절감)
  useEffect(() => {
    if (!user) {
      setUserInterestedSet(new Set());
      setUserBidMap(new Map());
      return;
    }
    const auctionIds = auctions.active.map(a => a.id);
    const fetchAll = async () => {
      const [interestsResult, bidsResult] = await Promise.all([
        supabase.from("chat_interests").select("auction_id").eq("user_id", user.id),
        auctionIds.length > 0
          ? supabase
              .from("bids")
              .select("auction_id, bid_amount")
              .eq("bidder_id", user.id)
              .in("auction_id", auctionIds)
              .order("bid_amount", { ascending: false })
          : Promise.resolve({ data: [] as { auction_id: string; bid_amount: number }[] }),
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
    };
    fetchAll();
  }, [user, auctions.active, supabase]);

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
    setShowGuide(false);
    localStorage.setItem(GUIDE_DISMISSED_KEY, "1");
  };



  return (
    <>
      <div className="space-y-4">


        {/* Onboarding Guide - 첫 방문 시에만 표시, 닫으면 ? 버튼 */}
        {showGuide ? (
          <section className="px-1">
            <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-4 overflow-hidden relative">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="text-[15px] font-black text-white flex items-start gap-2 leading-snug">
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse mt-1.5 shrink-0" />
                  <span className="whitespace-pre-line">{TAB_PROMISES[currentTab]}</span>
                </h2>
                <button
                  onClick={dismissGuide}
                  className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {(() => {
                const steps = currentTab === "puzzle"
                  ? PUZZLE_ONBOARDING_STEPS
                  : currentTab === "advance"
                  ? EARLYBIRD_ONBOARDING_STEPS
                  : ONBOARDING_STEPS;
                return (
              <div className="flex flex-col gap-2">
                {steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="bg-neutral-900/50 border border-neutral-800/50 rounded-2xl p-3 flex flex-row items-center gap-3 cursor-default"
                  >
                    <div className={`w-11 h-11 rounded-xl ${step.color} flex items-center justify-center shrink-0`}>
                      {step.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[14px] font-black text-white mb-0.5 break-keep">
                        {step.title}
                      </h3>
                      <p className="text-[12px] text-neutral-400 font-medium leading-snug break-keep">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
                );
              })()}
            </div>
          </section>
        ) : null}

        <AuctionList
          activeAuctions={auctions.active}
          puzzles={puzzles}
          puzzleOfferCounts={puzzleOfferCounts}
          selectedArea={selectedArea}
          onAreaChange={setSelectedArea}
          userBidMap={userBidMap}
          userInterestedSet={userInterestedSet}
          userRole={user?.role as "user" | "md" | "admin" | undefined}
          initialTab={currentTab}
          onTabChange={handleTabChange}
          onShowGuide={() => setShowGuide(true)}
        />


        {!user && !isLoading && auctions.active.length > 0 && (
          <div className="text-center py-6 space-y-3">
            <p className="text-[12px] text-neutral-500">로그인하면 입찰에 참여할 수 있어요</p>
            <Link href="/login">
              <Button className="h-10 px-8 bg-white text-black font-bold text-sm rounded-full hover:bg-neutral-200">
                로그인하기
              </Button>
            </Link>
          </div>
        )}
      </div>


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
                대시보드에서 <span className="text-white font-bold">1분 만에 테이블을 등록</span>해보세요
              </p>
            </div>
            <div className="flex items-center gap-3 bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center text-green-500 font-black text-sm shrink-0">2</div>
              <p className="text-[13px] text-neutral-300 font-medium">
                유저들이 테이블을 <span className="text-white font-bold">예약·입찰</span>합니다
              </p>
            </div>
            <div className="flex items-center gap-3 bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center text-green-500 font-black text-sm shrink-0">3</div>
              <p className="text-[13px] text-neutral-300 font-medium">
                남는 테이블 없이 <span className="text-white font-bold">매출을 극대화</span> 해보세요
              </p>
            </div>
          </div>

          <div className="space-y-3 mt-6">
            <Button
              onClick={handleGoToDashboard}
              className="w-full h-14 bg-white hover:bg-neutral-200 text-black font-black text-base rounded-2xl transition-all active:scale-[0.98]"
            >
              MD 대시보드로 이동
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

      {/* 깃발 CTA - 신규 유저 1회 표시 */}
      <Sheet open={showFlagCTA} onOpenChange={(o) => { if (!o) handleDismissFlagCTA(); }}>
        <SheetContent side="bottom" className="rounded-t-3xl bg-[#1C1C1E] border-t border-neutral-800 pb-10">
          <div className="flex flex-col items-center text-center pt-2 pb-4 gap-4">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center text-3xl">⛳</div>
            <div>
              <SheetTitle className="text-white font-black text-2xl">같은 예산으로도<br />최상의 테이블을 얻는 방법!</SheetTitle>
              <SheetDescription className="text-neutral-400 text-sm mt-1">
                날짜·지역만 찍으면 MD들이 알아서 붙어요
              </SheetDescription>
            </div>
            <div className="w-full flex flex-col gap-2">
              {PUZZLE_ONBOARDING_STEPS.map((step) => (
                <div key={step.title} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${step.color}`}>
                  {step.icon}
                  <div className="text-left">
                    <p className="text-white text-sm font-semibold">{step.title}</p>
                    <p className="text-neutral-400 text-xs">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={handleGoToFlagNew} className="w-full h-14 bg-white text-black font-black text-base rounded-2xl">
              지금 깃발 꽂으러 가기 →
            </Button>
            <button onClick={handleDismissFlagCTA} className="text-sm text-neutral-500 py-1">
              나중에 둘러볼게요
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
