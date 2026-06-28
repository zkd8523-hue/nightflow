import type { MetadataRoute } from "next";
import { createServerClient } from "@supabase/ssr";

const BASE_URL = "https://nightflow.kr";

// sitemap은 매 요청마다 새로 생성 (빌드 시점의 빈 DB 캐시 회피 + 신선도 유지).
// sitemap.xml은 검색엔진 봇만 호출하므로 트래픽 부담 적음.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// sitemap.xml은 빌드/ISR 환경(쿠키 없음)에서 호출되므로
// next/headers cookies()를 부르는 createClient 대신 빈 쿠키 어댑터 사용.
// /clubs 페이지의 createAnonClient와 동일 패턴.
function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const SHARE_AREAS = ["강남", "홍대", "이태원", "부산", "광주", "대구"] as const;
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1.0 },
    { url: `${BASE_URL}/clubs`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/hotdeal`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    ...SHARE_AREAS.map((area) => ({
      url: `${BASE_URL}/share/${encodeURIComponent(area)}`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.9,
    })),
    ...SHARE_AREAS.map((area) => ({
      url: `${BASE_URL}/guest/${encodeURIComponent(area)}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    ...SHARE_AREAS.map((area) => ({
      url: `${BASE_URL}/hotplace/${encodeURIComponent(area)}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    { url: `${BASE_URL}/vision`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    // /en — 외국인 트랙 (구글 SEO 타겟). 한국어 메인이랑 hreflang으로 분리.
    { url: `${BASE_URL}/en`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/en/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/en/clubs`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    // /en/clubs/[area] — 동네별 단독 페이지 (Gangnam/Hongdae/Itaewon/Busan)
    // 각 동네 키워드 검색(예: "Hongdae club booking") 정확 매칭용.
    { url: `${BASE_URL}/en/clubs/gangnam`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/en/clubs/hongdae`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/en/clubs/itaewon`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/en/clubs/apgujeong`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/en/clubs/busan`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/en/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/en/vip-tables`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${BASE_URL}/en/guests`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/en/kpop-clubs`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    // /zh — 중국어 트랙 (중국·대만·홍콩 관광객 SEO 타겟)
    { url: `${BASE_URL}/zh`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/zh/clubs`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/zh/clubs/gangnam`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/zh/clubs/hongdae`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/zh/clubs/itaewon`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/zh/clubs/apgujeong`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/zh/clubs/busan`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/zh/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/zh/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/zh/vip-tables`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${BASE_URL}/zh/guests`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/zh/kpop-clubs`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
  ];

  try {
    const supabase = createAnonClient();

    const nowIso = new Date().toISOString();
    // 테스트/운영자 데이터는 sitemap에서 제외 — 검색엔진 색인 오염 방지.
    // 클럽: is_test=false / 깃발: leader(users).is_test=false (club_id 없으므로 leader 기준)
    const [auctionsRes, clubsRes, puzzlesRes, hotdealsRes] = await Promise.all([
      supabase
        .from("auctions")
        .select("id, updated_at, status, club:clubs!inner(is_test)")
        .eq("clubs.is_test", false)
        .in("status", ["active", "scheduled", "won", "contacted", "confirmed"])
        .order("updated_at", { ascending: false })
        .limit(1000),
      supabase
        .from("clubs")
        .select("id")
        .is("deleted_at", null)
        .eq("is_test", false)
        .limit(200),
      supabase
        .from("puzzles")
        .select("id, updated_at, leader:users!puzzles_leader_id_fkey!inner(is_test)")
        .eq("users.is_test", false)
        .eq("status", "open")
        .gt("expires_at", new Date().toISOString())
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase
        .from("daily_hotdeals")
        .select("id, updated_at, ends_at, club:clubs!inner(is_test)")
        .eq("clubs.is_test", false)
        .gt("ends_at", nowIso)
        .order("updated_at", { ascending: false })
        .limit(500),
    ]);

    const auctionRoutes: MetadataRoute.Sitemap = (auctionsRes.data ?? []).map((a) => {
      const isLive = a.status === "active" || a.status === "scheduled";
      return {
        url: `${BASE_URL}/auctions/${a.id}`,
        lastModified: a.updated_at ? new Date(a.updated_at) : now,
        changeFrequency: (isLive ? "hourly" : "monthly") as
          | "hourly"
          | "monthly",
        priority: isLive ? 0.8 : 0.6,
      };
    });

    const clubRoutes: MetadataRoute.Sitemap = (clubsRes.data ?? []).map((c) => ({
      url: `${BASE_URL}/clubs/${c.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const puzzleRoutes: MetadataRoute.Sitemap = (puzzlesRes.data ?? []).map((p) => ({
      url: `${BASE_URL}/flags/${p.id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    }));

    const hotdealRoutes: MetadataRoute.Sitemap = (hotdealsRes.data ?? []).map((h) => ({
      url: `${BASE_URL}/hotdeal/${h.id}`,
      lastModified: h.updated_at ? new Date(h.updated_at) : now,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    }));

    return [
      ...staticRoutes,
      ...auctionRoutes,
      ...clubRoutes,
      ...puzzleRoutes,
      ...hotdealRoutes,
    ];
  } catch {
    return staticRoutes;
  }
}
