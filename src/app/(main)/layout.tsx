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

  // 클럽지도(view=map)에서 Header 자체를 마운트하지 않음 (hydration 영향 없음)
  const [isClubMapView, setIsClubMapView] = useState(false);
  useEffect(() => {
    const check = () => {
      const isMap =
        pathname === "/clubs" &&
        new URLSearchParams(window.location.search).get("view") === "map";
      setIsClubMapView(isMap);
    };
    check();
    window.addEventListener("club-view-change", check);
    window.addEventListener("popstate", check);
    return () => {
      window.removeEventListener("club-view-change", check);
      window.removeEventListener("popstate", check);
    };
  }, [pathname]);

  const handleRefresh = async () => {
    router.refresh();
    // 시각적 피드백을 위해 0.8초 정도 대기 (인디케이터가 바로 사라지는 것 방지)
    await new Promise((resolve) => setTimeout(resolve, 800));
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-neutral-950 flex flex-col">
        {!isClubMapView && <Header />}
        <main className={`flex-1 ${isClubMapView ? "" : "pb-16"}`}>{children}</main>
        {!isClubMapView && <Footer />}
        {!isClubMapView && <BottomNav />}
        <SelectingFlagAlertSheet />
        <CancellationSurveySheet isOtherSheetOpen={false} />
      </div>
    </PullToRefresh>
  );
}
