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
    { url: `${BASE_URL}/refund-policy`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/en/refund-policy`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/zh/refund-policy`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/ja/refund-policy`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // 외국어 트랙 약관·개인정보 stub (PG 심사 + 외국인 사용자 친화)
    { url: `${BASE_URL}/en/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/en/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/zh/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/zh/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/ja/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/ja/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
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
    { url: `${BASE_URL}/en/hiphop-clubs`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
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
    // /ja — 일본어 트랙 (일본 관광객 SEO 타겟)
    { url: `${BASE_URL}/ja`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/ja/clubs`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/ja/clubs/gangnam`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/ja/clubs/hongdae`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/ja/clubs/itaewon`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/ja/clubs/apgujeong`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/ja/clubs/busan`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/ja/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/ja/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/ja/vip-tables`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${BASE_URL}/ja/guests`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/ja/kpop-clubs`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    // /seoul-nightlife — "Seoul nightlife" 메인 키워드 매칭 페이지 (3개 언어)
    { url: `${BASE_URL}/en/seoul-nightlife`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${BASE_URL}/zh/seoul-nightlife`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${BASE_URL}/ja/seoul-nightlife`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    // /zh-tw — 번체 중국어 트랙 (대만·홍콩 SEO 타겟). 홈 + clubs + 지역 5개 + 서브페이지 9개.
    { url: `${BASE_URL}/zh-tw`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/zh-tw/clubs`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/zh-tw/clubs/gangnam`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/zh-tw/clubs/hongdae`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/zh-tw/clubs/itaewon`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/zh-tw/clubs/apgujeong`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE_URL}/zh-tw/clubs/busan`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/zh-tw/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/zh-tw/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/zh-tw/vip-tables`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${BASE_URL}/zh-tw/guests`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/zh-tw/kpop-clubs`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${BASE_URL}/zh-tw/seoul-nightlife`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${BASE_URL}/zh-tw/refund-policy`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/zh-tw/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/zh-tw/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const supabase = createAnonClient();

    const nowIso = new Date().toISOString();
    // 테스트/운영자 데이터는 sitemap에서 제외 — 검색엔진 색인 오염 방지.
    // 클럽: is_test=false / 깃발: leader(users).is_test=false (club_id 없으므로 leader 기준)
    const [auctionsRes, clubsRes, puzzlesRes, hotdealsRes, mdsRes] = await Promise.all([
      supabase
        .from("auctions")
        .select("id, updated_at, status, club:clubs!inner(is_test)")
        .eq("clubs.is_test", false)
        // 활성 경매만 sitemap 노출. 낙찰 후 상태(won/contacted/confirmed)는 유저 유입 무의미하고
        // 종료 상태는 auctions/[id] 페이지에서 리디렉트 처리 → sitemap에서 미리 제거.
        .in("status", ["active", "scheduled"])
        .order("updated_at", { ascending: false })
        .limit(1000),
      supabase
        .from("clubs")
        // status='approved'만 — 클럽 상세페이지(generateMetadata)가 approved만 렌더하고
        // 나머지는 404를 내므로, 미승인/병합 클럽이 sitemap에 들어가면 soft 404 색인 오염.
        .select("id")
        .eq("status", "approved")
        .is("deleted_at", null)
        .eq("is_test", false)
        .limit(200),
      supabase
        .from("puzzles")
        .select("id, updated_at, leader:public_user_profiles!puzzles_leader_id_fkey!inner(is_test)")
        .eq("public_user_profiles.is_test", false)
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
      // 승인 MD 공개 프로필 — 검색 유입용. 테스트 계정 제외.
      // 공개 뷰 사용. deleted_at 필터는 뷰 정의(WHERE deleted_at IS NULL)에 이미 포함돼
      // 있고 뷰에 그 컬럼이 없으므로 여기서 다시 걸지 않는다.
      supabase
        .from("public_user_profiles")
        .select("md_unique_slug, updated_at")
        .eq("md_status", "approved")
        .not("md_unique_slug", "is", null)
        .eq("is_test", false)
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

    const mdRoutes: MetadataRoute.Sitemap = (mdsRes.data ?? [])
      .filter((m) => m.md_unique_slug)
      .map((m) => ({
        url: `${BASE_URL}/md/${m.md_unique_slug}`,
        lastModified: m.updated_at ? new Date(m.updated_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));

    return [
      ...staticRoutes,
      ...auctionRoutes,
      ...clubRoutes,
      ...puzzleRoutes,
      ...hotdealRoutes,
      ...mdRoutes,
    ];
  } catch {
    return staticRoutes;
  }
}
