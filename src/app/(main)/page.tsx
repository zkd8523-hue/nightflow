import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { HomeContent } from "@/components/home/HomeContent";

export const revalidate = 10; // 10초마다 재검증

export default async function HomePage() {
  const supabase = await createClient();

  // 진행 중 + 예정된 경매 목록 조회
  const { data: activeAuctions } = await supabase
    .from("auctions")
    .select(
      `
      *,
      club:clubs(*),
      md:users!auctions_md_id_fkey(id, name, profile_image)
    `
    )
    .in("status", ["active", "scheduled"])
    .order("auction_start_at", { ascending: true })
    .limit(20);

  // 오픈 퍼즐 목록 조회
  const { data: puzzles } = await supabase
    .from("puzzles")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="container mx-auto max-w-lg px-4 py-4 mb-20">
      <Suspense fallback={<div className="animate-pulse bg-neutral-900 h-64 rounded-3xl" />}>
        <HomeContent
          activeAuctions={activeAuctions || []}
          puzzles={puzzles || []}
        />
      </Suspense>
    </div>
  );
}
