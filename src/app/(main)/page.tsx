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

  // 퍼즐별 오퍼 카운트 (pending만)
  const puzzleIds = (puzzles || []).map((p) => p.id);
  let offerCountMap: Record<string, number> = {};
  if (puzzleIds.length > 0) {
    const { data: offerRows } = await supabase
      .from("puzzle_offers")
      .select("puzzle_id")
      .in("puzzle_id", puzzleIds)
      .eq("status", "pending");
    if (offerRows) {
      offerRows.forEach((r) => {
        offerCountMap[r.puzzle_id] = (offerCountMap[r.puzzle_id] || 0) + 1;
      });
    }
  }

  return (
    <div className="container mx-auto max-w-lg px-4 py-4 mb-20">
      <Suspense fallback={<div className="animate-pulse bg-neutral-900 h-64 rounded-3xl" />}>
        <HomeContent
          activeAuctions={activeAuctions || []}
          puzzles={puzzles || []}
          puzzleOfferCounts={offerCountMap}
        />
      </Suspense>
    </div>
  );
}
