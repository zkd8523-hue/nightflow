import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { HomeContent } from "@/components/home/HomeContent";
import { getClubAliases, getPrimaryAlias } from "@/lib/clubs/aliases";

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

  const nowIso = new Date().toISOString();

  // 서로 독립적인 5개 SSR 쿼리를 병렬 실행 — 직렬 await(5 RTT) → 1 RTT 로 단축.
  // offerCount 만 puzzles 결과에 의존하므로 이 그룹 이후 순차 처리.
  const [
    { data: shareAuctions },
    { data: legacyAuctions },
    { data: rawClubs },
    { data: ssrHotdeals },
    { data: puzzlesRaw },
  ] = await Promise.all([
    // 조각(share) 매물 조회 — 메인 카탈로그 기본
    supabase
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
      .gt("share_deadline", nowIso)
      .order("share_deadline", { ascending: true })
      .limit(100),
    // 기존 경매(auction/instant) 조회 — 레거시 노출 (진행 중인 것만)
    supabase
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
      .limit(50),
    // 추천 클럽 조회 (ClubStrip용) — 순서 셔플은 클라이언트 마운트 시 수행
    supabase
      .from("clubs")
      .select("id, name, area, thumbnail_url")
      .is("deleted_at", null)
      .not("name", "ilike", "%운영자%")
      .order("name"),
    // SEO용: 오늘 진행 중인 핫딜 SSR 로드 (sr-only 본문에만 사용)
    supabase
      .from("daily_hotdeals")
      .select("id, title, price, original_price, club:clubs(name, area)")
      .eq("status", "active")
      .gt("ends_at", nowIso)
      .order("ends_at", { ascending: true })
      .limit(20),
    // 오픈/검토중 퍼즐 목록 조회 (leader deal_count_total 포함 — TrustBadge용)
    // expires_at > now() 가드를 selecting에도 적용 — cron 지연/실패 시 만료된 검토중이 무기한 노출되는 문제 차단
    supabase
      .from("puzzles")
      .select("*, leader:users!puzzles_leader_id_fkey(id, display_name, name, profile_image, deal_count_total, deal_amount_total, created_at, gender)")
      .in("status", ["open", "selecting"])
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const activeAuctions = [...(shareAuctions ?? []), ...(legacyAuctions ?? [])];

  const HIDDEN_FROM_RECOMMEND = ["prism", "eclipse", "luna", "orion"];
  const clubs = (rawClubs ?? []).filter((c) => {
    const lower = c.name.toLowerCase();
    return !HIDDEN_FROM_RECOMMEND.some(
      (kw) => lower.startsWith(kw) || lower.includes(`club ${kw}`)
    );
  });

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

  // SEO용 SSR 콘텐츠 — HomeContent는 client-side 렌더링이라 본문이 비어 보이는 문제 보완.
  // 시각엔 안 보이지만 검색엔진은 클럽 이름·별칭·진행 중 매물 정보를 읽음.
  // head: "강남 에이스(Club Ace)" / 메인 별칭 없으면 "강남 Club Ace"
  const ssrClubList = clubs.slice(0, 30).map((c) => {
    const areaPrefix = c.area ? `${c.area} ` : "";
    const primary = getPrimaryAlias(c.id);
    const aliases = getClubAliases(c.id);
    const restAliases = aliases.filter((a) => a !== primary);
    const head = primary
      ? `${areaPrefix}${primary}(${c.name})`
      : `${areaPrefix}${c.name}`;
    const aliasText = restAliases.length > 0 ? ` (${restAliases.join(", ")})` : "";
    return `${head}${aliasText}`;
  });
  const ssrActiveCount = activeAuctions.length;
  const ssrPuzzleCount = puzzles.length;
  const ssrHotdealCount = (ssrHotdeals ?? []).length;
  const formatPrice = (n: number | null | undefined) =>
    n ? `${Math.round(n / 10000)}만원` : "";

  return (
    <div className="container mx-auto max-w-lg px-4 pt-2 pb-4">
      <h1 className="sr-only">
        나플 - 강남·홍대 클럽 테이블 예약 (나이트플로우)
      </h1>
      <p className="sr-only">
        나플은 전국 인기 클럽 테이블을 실시간 경매로 예약하는 서비스입니다.
        나플에서 강남 클럽, 홍대 클럽, 신사 클럽의 MD가 잔여 테이블을 올리면
        회원이 입찰로 가격을 정해 정가보다 저렴하게 클럽 예약을 할 수 있습니다.
        강남 Club ACE, 홍대 버뮤다 등 전국 클럽 추천과 테이블 가격 비교는
        나플에서 확인하세요. 혼자 가긴 부담스러우면 퍼즐(클럽 조각·합석)
        기능으로 같은 클럽에 갈 일행을 모집할 수 있습니다.
        홍대 클럽 드레스코드, 입장료, 무료입장 받는 법 등 클럽 정보 가이드는{" "}
        <a href="https://blog.naver.com/dance_dna" rel="noopener">
          나플 운영자 블로그
        </a>
        에서 확인할 수 있습니다.
      </p>
      <div className="sr-only">
        <h2>지금 나플에서 진행 중인 클럽 매물</h2>
        <p>
          현재 나플에서 진행 중인 클럽 테이블 매물 {ssrActiveCount}건,
          일행 모집(퍼즐) {ssrPuzzleCount}건, 오늘의 클럽 핫딜 {ssrHotdealCount}건이
          등록되어 있습니다.
        </p>
        {ssrHotdealCount > 0 && (
          <>
            <h2>오늘 어디갈래? - 진행 중인 클럽 핫딜</h2>
            <ul>
              {(ssrHotdeals ?? []).slice(0, 20).map((h) => {
                const club = h.club as unknown as { name?: string; area?: string | null } | null;
                const area = club?.area ?? "";
                const clubName = club?.name ?? "";
                const areaPrefix = area ? `${area} ` : "";
                const priceLabel = formatPrice(h.price);
                const originalLabel = formatPrice(h.original_price);
                return (
                  <li key={h.id}>
                    {areaPrefix}{clubName} 핫딜 - {h.title ?? ""}
                    {priceLabel ? ` ${priceLabel}` : ""}
                    {originalLabel ? ` (정가 ${originalLabel})` : ""}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <h2>나플에서 만날 수 있는 클럽</h2>
        <ul>
          {ssrClubList.map((label, i) => (
            <li key={i}>{label}</li>
          ))}
        </ul>
      </div>
      {/* fallback 높이를 첫 화면 높이만큼 확보 — 콘텐츠 로드 시 footer가 위로 밀려 올라오는 CLS(레이아웃 시프트) 방지 */}
      <Suspense fallback={<div className="animate-pulse bg-neutral-900 min-h-[100svh] rounded-3xl" />}>
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
