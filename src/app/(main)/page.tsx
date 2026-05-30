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

  // 조각(share) 매물 조회 — 메인 카탈로그 기본
  const { data: shareAuctions } = await supabase
    .from("auctions")
    .select(
      `
      *,
      club:clubs(id, name, area, thumbnail_url),
      md:public_user_profiles!auctions_md_id_fkey(id, display_name, profile_image)
    `
    )
    .eq("listing_type", "share")
    .in("status", ["active", "scheduled"])
    .gt("share_deadline", new Date().toISOString())
    .order("share_deadline", { ascending: true })
    .limit(100);

  // 기존 경매(auction/instant) 조회 — 레거시 노출 (진행 중인 것만)
  const { data: legacyAuctions } = await supabase
    .from("auctions")
    .select(
      `
      *,
      club:clubs(id, name, area, thumbnail_url),
      md:public_user_profiles!auctions_md_id_fkey(id, display_name, profile_image)
    `
    )
    .in("listing_type", ["auction", "instant"])
    .in("status", ["active", "scheduled"])
    .order("auction_start_at", { ascending: true })
    .limit(50);

  const activeAuctions = [...(shareAuctions ?? []), ...(legacyAuctions ?? [])];

  // 추천 클럽 조회 (ClubStrip용) — 순서 셔플은 클라이언트 마운트 시 수행
  const { data: rawClubs } = await supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url")
    .is("deleted_at", null)
    .not("name", "ilike", "%운영자%")
    .order("name");

  const HIDDEN_FROM_RECOMMEND = ["prism", "eclipse", "luna", "orion"];
  const clubs = (rawClubs ?? []).filter((c) => {
    const lower = c.name.toLowerCase();
    return !HIDDEN_FROM_RECOMMEND.some(
      (kw) => lower.startsWith(kw) || lower.includes(`club ${kw}`)
    );
  });

  // 오픈/검토중 퍼즐 목록 조회 (leader deal_count_total 포함 — TrustBadge용)
  // expires_at > now() 가드를 selecting에도 적용 — cron 지연/실패 시 만료된 검토중이 무기한 노출되는 문제 차단
  const nowIso = new Date().toISOString();
  const { data: puzzlesRaw } = await supabase
    .from("puzzles")
    .select("*, leader:users!puzzles_leader_id_fkey(id, display_name, name, profile_image, deal_count_total, deal_amount_total, created_at, gender)")
    .in("status", ["open", "selecting"])
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(50);

  // selecting(검토 중)을 상단 우선 노출 — 남은 시간 짧아 긴급도 높음
  const puzzles = (puzzlesRaw ?? []).sort((a, b) => {
    if (a.status === b.status) return 0;
    if (a.status === "selecting") return -1;
    if (b.status === "selecting") return 1;
    return 0;
  });

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
        나플 - 강남·홍대 클럽 테이블 예약 (나이트플로우)
      </h1>
      <p className="sr-only">
        나플은 나이트플로우(NightFlow)의 줄임말로, 서울 인기 클럽 테이블을
        실시간 경매로 예약하는 서비스입니다. 나플에서 강남 클럽, 홍대 클럽,
        신사 클럽의 MD가 잔여 테이블을 올리면 회원이 입찰로 가격을 정해
        정가보다 저렴하게 클럽 예약을 할 수 있습니다. 강남 Club ACE, 홍대 버뮤다
        등 서울 클럽 추천과 테이블 가격 비교는 나플에서 확인하세요. 혼자
        가긴 부담스러우면 퍼즐(클럽 조각·합석) 기능으로 같은 클럽에 갈
        일행을 모집할 수 있습니다.
      </p>
      <Suspense fallback={<div className="animate-pulse bg-neutral-900 h-64 rounded-3xl" />}>
        <HomeContent
          activeAuctions={activeAuctions || []}
          puzzles={puzzles || []}
          puzzleOfferCounts={offerCountMap}
          clubs={clubs || []}
        />
      </Suspense>
    </div>
  );
}
