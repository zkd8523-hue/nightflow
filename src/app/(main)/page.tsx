import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { HomeContent } from "@/components/home/HomeContent";

export const revalidate = 10; // 10초마다 재검증

// cookies()를 호출하지 않는 anon 클라이언트 — ISR 캐시 활성화
function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export default async function HomePage() {
  const supabase = createAnonClient();

  // 진행 중 + 예정된 경매 목록 조회
  const { data: activeAuctions } = await supabase
    .from("auctions")
    .select(
      `
      *,
      club:clubs(id, name, area, thumbnail_url),
      md:public_user_profiles!auctions_md_id_fkey(id, display_name, profile_image)
    `
    )
    .in("status", ["active", "scheduled"])
    .order("auction_start_at", { ascending: true })
    .limit(200);

  // 오픈 퍼즐 목록 조회 (leader deal_count_total 포함 — TrustBadge용)
  const { data: puzzles } = await supabase
    .from("puzzles")
    .select("*, leader:users!puzzles_leader_id_fkey(id, display_name, name, profile_image, deal_count_total, created_at)")
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
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
      <h1 className="sr-only">
        나이트플로우(나플) - 강남·홍대·이태원 클럽 테이블 예약·추천
      </h1>
      <p className="sr-only">
        나플은 나이트플로우(NightFlow)의 줄임말로, 서울 인기 클럽 테이블을
        실시간 경매로 예약하는 서비스입니다. 강남 클럽, 홍대 클럽, 이태원
        클럽, 신사 클럽의 MD가 잔여 테이블을 올리면 회원이 입찰로 가격을
        정해 정가보다 저렴하게 클럽 예약을 할 수 있습니다. 강남 레이스&사운드,
        홍대 버뮤다 등 서울 클럽 추천과 테이블 가격 비교는 나플에서
        확인하세요.
      </p>
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
