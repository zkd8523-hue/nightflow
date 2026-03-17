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

  // 완료된 경매 목록 조회 (최근 순서)
  const { data: completedAuctions } = await supabase
    .from("auctions")
    .select(
      `
      *,
      club:clubs(*),
      md:users!auctions_md_id_fkey(id, name, profile_image)
    `
    )
    .in("status", ["won", "unsold", "contacted", "confirmed"])
    .order("auction_end_at", { ascending: false })
    .limit(20);

  return (
    <div className="container mx-auto max-w-lg px-4 py-4 mb-20">
      <HomeContent
        activeAuctions={activeAuctions || []}
        completedAuctions={completedAuctions || []}
      />
    </div>
  );
}
