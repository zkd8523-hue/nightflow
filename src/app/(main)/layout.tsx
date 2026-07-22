"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BottomNav } from "@/components/layout/BottomNav";
import { PullToRefresh } from "@/components/auctions/PullToRefresh";
import { SelectingFlagAlertSheet } from "@/components/puzzles/SelectingFlagAlertSheet";
import { NewOffersAlertSheet } from "@/components/puzzles/NewOffersAlertSheet";
import { FlagCreatedInstallSheet } from "@/components/puzzles/FlagCreatedInstallSheet";
import { ChatUpdateSheet } from "@/components/common/ChatUpdateSheet";
import { PriceRangeOnboardingSheet } from "@/components/md/PriceRangeOnboardingSheet";
import { GuestSignPromoGate } from "@/components/md/GuestSignPromoGate";
import { CancellationSurveySheet } from "@/components/puzzles/CancellationSurveySheet";
import { CameraLayer } from "@/components/chat/CameraLayer";
import { useRouter, usePathname } from "next/navigation";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // iframe 임베드 모드(예: 지도 모달에서 /clubs/{id}?embedded=1) — 헤더/네비 숨김.
  // useSearchParams는 정적 prerender 시 Suspense 요구하므로 window 직접 사용.
  const [isEmbedded, setIsEmbedded] = useState(false);
  useEffect(() => {
    setIsEmbedded(
      new URLSearchParams(window.location.search).get("embedded") === "1"
    );
  }, [pathname]);

  // 외국인 트랙(lang=en) — 한국 글로벌 헤더/푸터/바텀네비를 숨김.
  // /en은 자체 chrome을 쓰고, /flags/new 등 (main) 진입 시 한국 chrome 노출 방지.
  const [isForeigner, setIsForeigner] = useState(false);
  useEffect(() => {
    const l = new URLSearchParams(window.location.search).get("lang");
    setIsForeigner(!!l && l !== "ko");
  }, [pathname]);

  // 클럽지도(view=map)에서 Header 자체를 마운트하지 않음.
  // URL search 폴링은 일부 환경에서 동기화 지연이 있어,
  // ClubList가 직접 보내주는 'club-view-change' 이벤트의 detail.view를 우선 사용.
  const [isClubMapView, setIsClubMapView] = useState(false);
  useEffect(() => {
    // /clubs를 떠나면 무조건 false로 리셋
    if (pathname !== "/clubs") {
      setIsClubMapView(false);
      return;
    }
    // 기본값이 list라 view=map이 명시된 경우만 map으로 간주
    const urlView = new URLSearchParams(window.location.search).get("view");
    setIsClubMapView(urlView === "map");

    // 이벤트 기반 후속 동기화 (토글 변경)
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ view?: string }>).detail;
      if (detail?.view) {
        setIsClubMapView(detail.view === "map");
      } else {
        // detail 없으면 URL 재조회 fallback (기본 list)
        setIsClubMapView(
          new URLSearchParams(window.location.search).get("view") === "map"
        );
      }
    };
    window.addEventListener("club-view-change", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("club-view-change", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, [pathname]);

  const handleRefresh = async () => {
    router.refresh();
    // 시각적 피드백을 위해 0.8초 정도 대기 (인디케이터가 바로 사라지는 것 방지)
    await new Promise((resolve) => setTimeout(resolve, 800));
  };

  const isChatPage = pathname === "/chat" || pathname?.startsWith("/chat/");

  // 오퍼 1:1 채팅 상세는 자체 헤더로 풀스크린 (Migration 332)
  const isMessageDetail = !!pathname && /^\/messages\/.+/.test(pathname);

  // 조각 단체채팅도 자체 헤더로 풀스크린 (Migration 349)
  const isPartyChat = !!pathname && /^\/party\/.+/.test(pathname);

  // 1:1 DM(LIVE 메시지)도 자체 헤더로 풀스크린 — 전역 헤더/푸터가 겹치면
  // DmRoom의 100dvh와 합쳐져 빈 공간이 생기고 입력창이 화면 밖으로 밀린다.
  const isDmRoom = !!pathname && /^\/dm\/.+/.test(pathname);

  // 고객 문의 채팅도 자체 헤더로 풀스크린 (Migration 337)
  const isContact = pathname === "/contact";

  // Vision은 풀스크린 매니페스토 — 헤더/푸터/바텀네비 없이 단독 노출
  const isVisionPage = pathname === "/vision";

  // 헤더/푸터/바텀네비를 숨기는 풀스크린 모드 (클럽지도 + Vision + iframe 임베드 + 외국인 트랙 + 오퍼 채팅)
  const isChromeless = isClubMapView || isVisionPage || isEmbedded || isForeigner || isMessageDetail || isPartyChat || isDmRoom || isContact;

  return (
    <PullToRefresh onRefresh={handleRefresh} disabled={isChatPage}>
      <div className="bg-background flex flex-col">
        {/* 와글은 헤더 바 제거 — 채팅 영역 확보 (LIVE 행/탭은 페이지 내부에서 노출) */}
        {!isChromeless && !isChatPage && <Header />}
        <main className={isChromeless ? "" : isChatPage ? "" : "pb-16"}>{children}</main>
        {!isChromeless && !isChatPage && <Footer />}
        {!isChromeless && <BottomNav />}
        <SelectingFlagAlertSheet />
        <NewOffersAlertSheet />
        <CancellationSurveySheet isOtherSheetOpen={false} />
        <FlagCreatedInstallSheet />
        <ChatUpdateSheet />
        <PriceRangeOnboardingSheet />
        <GuestSignPromoGate />
      </div>
      {/* 전역 카메라 레이어 — 모든 Sheet/Dialog 바깥. Radix 조상 불투명 레이어 영향 없음 */}
      <CameraLayer />
    </PullToRefresh>
  );
}
