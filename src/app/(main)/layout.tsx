"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { GlobalBidFeed } from "@/components/auctions/GlobalBidFeed";
import { PullToRefresh } from "@/components/auctions/PullToRefresh";
import { useRouter } from "next/navigation";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(true);

  // 브라우저 포커스 상태 감지 (페이지가 보일 때만 Realtime 구독)
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const handleRefresh = async () => {
    router.refresh();
    // 시각적 피드백을 위해 0.8초 정도 대기 (인디케이터가 바로 사라지는 것 방지)
    await new Promise((resolve) => setTimeout(resolve, 800));
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-neutral-950 flex flex-col">
        {/* 페이지 포커스 시에만 GlobalBidFeed 구독 */}
        {isVisible && <GlobalBidFeed />}
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </PullToRefresh>
  );
}
