"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { GlobalBidFeed } from "@/components/auctions/GlobalBidFeed";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isVisible, setIsVisible] = useState(true);

  // 브라우저 포커스 상태 감지 (페이지가 보일 때만 Realtime 구독)
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      {/* 페이지 포커스 시에만 GlobalBidFeed 구독 */}
      {isVisible && <GlobalBidFeed />}
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
