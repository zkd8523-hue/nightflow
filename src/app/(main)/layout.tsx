"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BottomNav } from "@/components/layout/BottomNav";
import { PullToRefresh } from "@/components/auctions/PullToRefresh";
import { SelectingFlagAlertSheet } from "@/components/puzzles/SelectingFlagAlertSheet";
import { CancellationSurveySheet } from "@/components/puzzles/CancellationSurveySheet";
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
    // 기본값이 map이라 view=list가 명시되지 않으면 map으로 간주
    const urlView = new URLSearchParams(window.location.search).get("view");
    setIsClubMapView(urlView !== "list");

    // 이벤트 기반 후속 동기화 (토글 변경)
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ view?: string }>).detail;
      if (detail?.view) {
        setIsClubMapView(detail.view !== "list");
      } else {
        // detail 없으면 URL 재조회 fallback (기본 map)
        setIsClubMapView(
          new URLSearchParams(window.location.search).get("view") !== "list"
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

  // Vision은 풀스크린 매니페스토 — 헤더/푸터/바텀네비 없이 단독 노출
  const isVisionPage = pathname === "/vision";

  // 헤더/푸터/바텀네비를 숨기는 풀스크린 모드 (클럽지도 + Vision + iframe 임베드)
  const isChromeless = isClubMapView || isVisionPage || isEmbedded;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="bg-[#0B0A11] flex flex-col">
        {!isChromeless && (
          isChatPage ? (
            <Header
              compact
              customTitle="WAGLE"
              customSubtitle="지역 인증된 사람들끼리 모이는 실시간 피드"
            />
          ) : (
            <Header />
          )
        )}
        <main className={isChromeless ? "" : "pb-16"}>{children}</main>
        {!isChromeless && <Footer />}
        {!isChromeless && <BottomNav />}
        <SelectingFlagAlertSheet />
        <CancellationSurveySheet isOtherSheetOpen={false} />
      </div>
    </PullToRefresh>
  );
}
