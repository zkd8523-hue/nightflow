import type { MetadataRoute } from "next";
import { eventSlug } from "@/lib/events/slug";
import { createServerClient } from "@supabase/ssr";
import { clubSlug, canonicalAreaSlug } from "@/lib/clubs/slug";

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
    { url: `${BASE_URL}/lineups`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/dj-cup`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/dj-cup/ranking`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE_URL}/events`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
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
    // 지역별 라인업/공연 — /lineups(전국)와 /clubs/[id]/lineup(클럽 하나)의 중간 계층.
    // 목록은 각 페이지의 SUPPORTED_AREAS 화이트리스트와 반드시 일치해야 한다(다르면
    // 사이트맵엔 있는데 페이지는 404, 혹은 그 반대가 된다). 라인업 5건 미만 지역은
    // thin content라 제외(실측 2026-08-29: 대전 1·광주 4).
    ...(["이태원", "홍대", "강남", "부산", "대구", "수원"] as const).map((area) => ({
      url: `${BASE_URL}/lineups/${encodeURIComponent(area)}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.75,
    })),
    // 공연 5건 미만 지역 제외(실측: 광주 4·대구 4), 외국 도시(타이페이·도쿄)는
    // 한국어 트랙 소관이 아니라 제외.
    ...(["홍대", "이태원", "서울", "강남", "대전", "부산"] as const).map((area) => ({
      url: `${BASE_URL}/events/area/${encodeURIComponent(area)}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.75,
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
    // 실용 질문 대응 — 외국인이 실제로 검색하는 불안(비용·시간·입장규정·복장).
    // 입장료/영업시간은 클럽 실데이터 기반이라 경쟁 블로그와 차별된다.
    ...["club-prices", "club-hours", "club-entry-rules", "dress-code"].flatMap((slug) =>
      ["en", "ja", "zh", "zh-tw"].map((l) => ({
        url: `${BASE_URL}/${l}/${slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.85,
      }))
    ),
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
    // 라인업 아카이브 색인 범위 — 지난 60일 + 향후 14일.
    // 지난 날짜도 싣는 이유: "클럽명 8월 30일 라인업" 류 쿼리는 행사가 끝난 뒤에도
    // 검색되고, 해당 페이지는 계속 200을 낸다(날짜별 페이지는 만료되지 않음).
    const dayMs = 24 * 60 * 60 * 1000;
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
    const lineupFrom = new Date(kstNow.getTime() - 60 * dayMs).toISOString().slice(0, 10);
    const lineupTo = new Date(kstNow.getTime() + 14 * dayMs).toISOString().slice(0, 10);

    const [auctionsRes, clubsRes, puzzlesRes, mdsRes, lineupsRes,
      eventsRes, djsRes, venuesRes, artistPerfRes,
    ] = await Promise.all([
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
        // name_en/area는 영어 클럽 페이지(/en/clubs/{area}/{slug}) URL 생성에 필요
        .select("id, name_en, area, hidden_from_guide")
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
      // 승인 파트너 공개 프로필 — 검색 유입용. 테스트 계정 제외.
      // 구 /md/<slug>가 아니라 통합 프로필 /u/<id>를 싣는다. (/md/<slug>는 308 리다이렉트)
      // 공개 뷰 사용. deleted_at 필터는 뷰 정의(WHERE deleted_at IS NULL)에 이미 포함돼
      // 있고 뷰에 그 컬럼이 없으므로 여기서 다시 걸지 않는다.
      supabase
        .from("public_user_profiles")
        .select("id, updated_at")
        .eq("md_status", "approved")
        .not("md_unique_slug", "is", null)
        .eq("is_test", false)
        .limit(500),
      // 날짜별 라인업 아카이브. club_lineups에는 is_test가 없으므로 clubs!inner 조인으로
      // 테스트 클럽을 거른다(558 규약) — 안 걸면 테스트 클럽이 색인된다.
      supabase
        .from("club_lineups")
        .select("club_id, event_date, clubs!inner(is_test, status, deleted_at)")
        .eq("clubs.is_test", false)
        .eq("clubs.status", "approved")
        .is("clubs.deleted_at", null)
        .gte("event_date", lineupFrom)
        .lte("event_date", lineupTo)
        .order("event_date", { ascending: false })
        .limit(500),
      // 공연 상세(/events/{date}/{slug}) — 슬러그는 title에서 파생하므로 title을 같이 받는다.
      // 지난 공연도 싣는다: 행사가 끝나도 "공연명" 검색은 계속 들어오고 페이지는 200을 낸다
      // (라인업 아카이브와 같은 근거).
      supabase
        .from("club_events")
        .select("event_date, title, clubs(is_test, status, deleted_at)")
        .eq("status", "approved")
        .gte("event_date", lineupFrom)
        .order("event_date", { ascending: false })
        .limit(500),
      // DJ 공개 프로필(/dj/{slug}) — 라인업 0건인 DJ는 thin content라 제외.
      // lineup_sets!inner로 필터하면 라인업이 하나도 없는 DJ는 자동으로 빠진다.
      supabase
        .from("djs")
        .select("slug, updated_at, lineup_sets!inner(id)")
        .eq("is_test", false)
        .is("deleted_at", null)
        .limit(500),
      // 공연장(/venues/{slug}) — 공연 0건인 곳은 thin content 라 제외.
      // club_events!inner 조인이 그 필터를 겸한다.
      supabase
        .from("venues")
        .select("slug, updated_at, club_events!inner(id)")
        .eq("is_test", false)
        .is("deleted_at", null)
        .limit(200),
      // 아티스트(/artists/{slug}) 카운트용 — 공연 1건뿐(1,129명 중 823명, 73%)은
      // thin content라 제외한다. count>=2 필터는 PostgREST가 직접 못 하므로
      // 출연 행을 다 받아 이후 JS에서 집계한다(2,003행 — limit 넉넉히).
      supabase
        .from("club_event_performers")
        .select("artist_id, club_events!inner(status)")
        .eq("club_events.status", "approved")
        .limit(5000),
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

    // 클럽 개별 페이지 — 클럽명+속성 롱테일("Hongdae B1 opening hours") 대응.
    // 4개 언어 트랙 전부(en/ja/zh/zh-tw) — 지역 페이지가 있는 지역(강남/홍대/이태원/부산)만.
    // 나머지 지역은 부모(지역 페이지) 없는 고아 URL이 되므로 제외.
    const FOREIGN_LANGS = ["en", "ja", "zh", "zh-tw"] as const;
    const enClubRoutes: MetadataRoute.Sitemap = (clubsRes.data ?? [])
      .flatMap((c) => {
        const areaSlug = canonicalAreaSlug(c.area);
        const nameEn = c.name_en?.trim();
        if (!areaSlug || !nameEn || c.hidden_from_guide) return [];
        const slug = clubSlug(nameEn);
        if (!slug) return [];
        return FOREIGN_LANGS.map((lang) => ({
          url: `${BASE_URL}/${lang}/clubs/${areaSlug}/${slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.75,
        }));
      });

    const puzzleRoutes: MetadataRoute.Sitemap = (puzzlesRes.data ?? []).map((p) => ({
      url: `${BASE_URL}/flags/${p.id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    }));

    // hotdealRoutes 제거 — /hotdeal 라우트 폐기(색인된 URL이 404가 되지 않도록 sitemap에서도 제외)

    const mdRoutes: MetadataRoute.Sitemap = (mdsRes.data ?? [])
      .filter((m) => m.id)
      .map((m) => ({
        url: `${BASE_URL}/u/${m.id}`,
        lastModified: m.updated_at ? new Date(m.updated_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));

    const lineupRoutes: MetadataRoute.Sitemap = (lineupsRes.data ?? []).map((l) => ({
      url: `${BASE_URL}/clubs/${l.club_id}/lineup/${l.event_date}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.65,
    }));

    // 클럽별 라인업 허브(/clubs/[id]/lineup) — 위 날짜별 라인업의 부모. 부모가 없으면
    // 크롤러가 날짜 페이지에서 한 단계 올라왔을 때 404를 맞는다(events/[date]가 이미
    // 같은 이유로 존재하는 것과 동일한 문제). lineupsRes에서 club_id만 중복 제거.
    const lineupClubIds = [...new Set((lineupsRes.data ?? []).map((l) => l.club_id))];
    const clubLineupHubRoutes: MetadataRoute.Sitemap = lineupClubIds.map((clubId) => ({
      url: `${BASE_URL}/clubs/${clubId}/lineup`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    // 공연 상세 — 테스트/미승인 클럽에 붙은 건 제외. club_id 없는 공연(283건)은 그대로 싣는다.
    const eventRoutes: MetadataRoute.Sitemap = (eventsRes.data ?? [])
      .filter((e) => {
        const c = Array.isArray(e.clubs) ? e.clubs[0] : e.clubs;
        return !(c && (c.is_test || c.deleted_at || c.status !== "approved"));
      })
      .map((e) => ({ date: e.event_date as string, slug: eventSlug(e.title as string | null) }))
      .filter((e) => e.date && e.slug)
      .map((e) => ({
        url: `${BASE_URL}/events/${e.date}/${encodeURIComponent(e.slug)}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.65,
      }));

    const djRoutes: MetadataRoute.Sitemap = (djsRes.data ?? [])
      .filter((d) => d.slug)
      .map((d) => ({
        url: `${BASE_URL}/dj/${d.slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));

    const venueRoutes: MetadataRoute.Sitemap = (venuesRes.data ?? [])
      .filter((v) => v.slug)
      .map((v) => ({
        url: `${BASE_URL}/venues/${v.slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));

    // 공연 2건 이상인 아티스트만 — thin content 제외 기준은 공연장(venueRoutes)과 동일 원칙.
    const artistEventCounts = new Map<string, number>();
    for (const p of artistPerfRes.data ?? []) {
      artistEventCounts.set(p.artist_id, (artistEventCounts.get(p.artist_id) ?? 0) + 1);
    }
    const qualifyingArtistIds = Array.from(artistEventCounts.entries())
      .filter(([, count]) => count >= 2)
      .map(([id]) => id);

    let artistRoutes: MetadataRoute.Sitemap = [];
    if (qualifyingArtistIds.length > 0) {
      const { data: artistsData } = await supabase
        .from("artists")
        .select("slug, updated_at")
        .in("id", qualifyingArtistIds)
        .eq("is_test", false)
        .is("deleted_at", null)
        .limit(1000);
      artistRoutes = (artistsData ?? [])
        .filter((a) => a.slug)
        .map((a) => ({
          url: `${BASE_URL}/artists/${a.slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        }));
    }

    return [
      ...staticRoutes,
      ...auctionRoutes,
      ...clubRoutes,
      ...enClubRoutes,
      ...puzzleRoutes,
      ...mdRoutes,
      ...lineupRoutes,
      ...clubLineupHubRoutes,
      ...eventRoutes,
      ...djRoutes,
      ...venueRoutes,
      ...artistRoutes,
    ];
  } catch {
    return staticRoutes;
  }
}
