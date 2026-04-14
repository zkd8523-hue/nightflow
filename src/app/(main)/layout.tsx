"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BottomNav } from "@/components/layout/BottomNav";
import { PullToRefresh } from "@/components/auctions/PullToRefresh";
import { useRouter } from "next/navigation";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleRefresh = async () => {
    router.refresh();
    // 시각적 피드백을 위해 0.8초 정도 대기 (인디케이터가 바로 사라지는 것 방지)
    await new Promise((resolve) => setTimeout(resolve, 800));
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-neutral-950 flex flex-col">
        <Header />
        <main className="flex-1 pb-16">{children}</main>
        <Footer />
        <BottomNav />
      </div>
    </PullToRefresh>
  );
}
