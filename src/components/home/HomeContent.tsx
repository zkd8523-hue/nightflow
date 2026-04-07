"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuctionList } from "@/components/auctions/AuctionList";
import { PullToRefresh } from "@/components/auctions/PullToRefresh";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { MAIN_AREAS } from "@/lib/constants/areas";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Zap, Trophy, Phone, CheckCircle2, ChevronRight, HelpCircle, X, PartyPopper } from "lucide-react";
import type { Auction } from "@/types/database";
import { logger } from "@/lib/utils/logger";

const GUIDE_DISMISSED_KEY = "nightflow_guide_dismissed";

const ONBOARDING_STEPS = [
  {
    title: "1. 구매하기",
    desc: "원하는 클럽 테이블을 선택하세요.",
    icon: <Zap className="w-5 h-5 text-amber-500" />,
    color: "bg-amber-500/10",
  },
  {
    title: "2. 구매확정",
    desc: "예약 또는 입찰 경쟁으로 확정!",
    icon: <Trophy className="w-5 h-5 text-yellow-500" />,
    color: "bg-yellow-500/10",
  },
  {
    title: "3. MD 연락",
    desc: "제한 시간 내에 MD에게 연락하세요.",
    icon: <Phone className="w-5 h-5 text-emerald-500" />,
    color: "bg-emerald-500/10",
  },
  {
    title: "4. 방문확정",
    desc: "현장에서 MD에게 확인받으세요.",
    icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
    color: "bg-blue-500/10",
  },
];

interface HomeContentProps {
  activeAuctions: Auction[];
}

export function HomeContent({
  activeAuctions,
}: HomeContentProps) {
  const { user } = useCurrentUser();
  const isMD = user?.role === "md" && user?.md_status === "approved";
  const router = useRouter();
  const supabase = createClient();

  const [showMDWelcome, setShowMDWelcome] = useState(false);

  useEffect(() => {
    if (user?.role === "md" && user?.md_status === "approved" && user?.md_welcome_shown === false) {
      const timer = setTimeout(() => setShowMDWelcome(true), 500);
      return () => clearTimeout(timer);
    }
  }, [user]);

  const handleDismissMDWelcome = async () => {
    setShowMDWelcome(false);
    if (user) {
      await supabase.from("users").update({ md_welcome_shown: true }).eq("id", user.id);
    }
  };

  const handleGoToDashboard = () => {
    setShowMDWelcome(false);
    if (user) {
      supabase.from("users").update({ md_welcome_shown: true }).eq("id", user.id);
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

  useEffect(() => {
    if (!user) { setUserInterestedSet(new Set()); return; }
    const fetchInterests = async () => {
      const { data } = await supabase
        .from("chat_interests")
        .select("auction_id")
        .eq("user_id", user.id);
      if (data) setUserInterestedSet(new Set(data.map((d: { auction_id: string }) => d.auction_id)));
    };
    fetchInterests();
  }, [user, supabase]);

  useEffect(() => {
    if (!user || auctions.active.length === 0) {
      setUserBidMap(new Map());
      return;
    }
    const fetchUserBids = async () => {
      const { data } = await supabase
        .from("bids")
        .select("auction_id, bid_amount")
        .eq("bidder_id", user.id)
        .in("auction_id", auctions.active.map(a => a.id))
        .order("bid_amount", { ascending: false });
      if (data) {
        const map = new Map<string, number>();
        for (const bid of data) {
          if (!map.has(bid.auction_id)) map.set(bid.auction_id, bid.bid_amount);
        }
        setUserBidMap(map);
      }
    };
    fetchUserBids();
  }, [user, auctions.active, supabase]);

  // Props 업데이트 시 로컬 상태 동기화 (global router.refresh 대응)
  useEffect(() => {
    setAuctions({
      active: activeAuctions,
    });
  }, [activeAuctions]);

  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(GUIDE_DISMISSED_KEY);
    if (!dismissed) setShowGuide(true);
  }, []);

  const dismissGuide = () => {
    setShowGuide(false);
    localStorage.setItem(GUIDE_DISMISSED_KEY, "1");
  };



  return (
    <>
      <div className="space-y-4">

        {/* 지역 필터 바 */}
        <div className="sticky top-14 z-40 bg-[#0A0A0A]/95 backdrop-blur-sm py-2.5 -mx-4 px-4 border-b border-neutral-800/50">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setSelectedArea(null)}
              className={`text-[13px] font-bold px-4 py-2 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                selectedArea === null
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
            >
              전체
            </button>
            {MAIN_AREAS.map((area) => (
              <button
                key={area}
                onClick={() => setSelectedArea(area)}
                className={`text-[13px] font-bold px-4 py-2 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                  selectedArea === area
                    ? "bg-white text-black"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </div>

        {/* Onboarding Guide - 첫 방문 시에만 표시, 닫으면 ? 버튼 */}
        {showGuide ? (
          <section className="px-1">
            <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-5 overflow-hidden relative">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[15px] font-black text-white flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  이용 방법
                </h2>
                <button
                  onClick={dismissGuide}
                  className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {ONBOARDING_STEPS.map((step, idx) => (
                  <div
                    key={idx}
                    className="bg-neutral-900/50 border border-neutral-800/50 rounded-2xl p-4 flex flex-col gap-3 cursor-default"
                  >
                    <div className={`w-10 h-10 rounded-xl ${step.color} flex items-center justify-center`}>
                      {step.icon}
                    </div>
                    <div>
                      <h3 className="text-[13px] font-black text-white mb-1">
                        {step.title}
                      </h3>
                      <p className="text-[10px] text-neutral-400 font-medium leading-tight line-clamp-2">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <div className="px-1 flex justify-end">
            <button
              onClick={() => setShowGuide(true)}
              className="flex items-center gap-1.5 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              이용 방법
            </button>
          </div>
        )}

        <AuctionList
          activeAuctions={auctions.active}
          selectedArea={selectedArea}
          userBidMap={userBidMap}
          userInterestedSet={userInterestedSet}
        />

        {!user && auctions.active.length > 0 && (
          <div className="text-center py-6 space-y-3">
            <p className="text-[12px] text-neutral-500">로그인하면 구매에 참여할 수 있어요</p>
            <Link href="/login">
              <Button className="h-10 px-8 bg-white text-black font-bold text-sm rounded-full hover:bg-neutral-200">
                로그인하기
              </Button>
            </Link>
          </div>
        )}
      </div>

      {isMD && (
        <Link
          href="/md/dashboard"
          className="fixed bottom-24 right-4 w-12 h-12 bg-white text-black rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-50"
        >
          <LayoutDashboard className="w-5 h-5" />
        </Link>
      )}

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
                유저들이 테이블을 <span className="text-white font-bold">예약 및 입찰</span>합니다
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
    </>
  );
}
