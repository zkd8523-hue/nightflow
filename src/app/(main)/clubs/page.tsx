import type { Metadata } from "next";
import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { ClubList } from "@/components/clubs/ClubList";
import { ClubsAdminFab } from "@/components/clubs/ClubsAdminFab";
import { normalizeDowSlots, summarizeSlots } from "@/lib/utils/hotdeal";
import type { HotdealBenefitsByDow, HotdealDow } from "@/types/database";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "전국 클럽 가이드 - 강남·홍대·이태원 클럽 정보 한눈에",
  description:
    "우리나라 클럽 정보를 한눈에. 강남·홍대·이태원·부산·광주·대구 인기 클럽을 둘러보고, 예약 가능한 곳은 깃발로 바로 잡으세요.",
  alternates: { canonical: "https://nightflow.kr/clubs" },
  openGraph: {
    title: "전국 클럽 가이드 - 나이트플로우(나플)",
    description:
      "전국 인기 클럽 정보를 한눈에 비교. 마음에 드는 클럽은 깃발 한 번으로 예약.",
    url: "https://nightflow.kr/clubs",
    type: "website",
  },
};

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export default async function ClubsIndexPage() {
  const supabase = createAnonClient();

  // 신규 컬럼 (tags, drink_menu_url)을 먼저 시도하고, 마이그레이션 미적용 환경에서는
  // 기본 컬럼만 사용. 컬럼 없을 때 PostgREST가 전체 쿼리를 실패시키므로 fallback 필요.
  let clubsRes: { data: Array<Record<string, unknown>> | null; error: unknown } =
    await supabase
      .from("clubs")
      .select("id, name, area, thumbnail_url, tags, drink_menu_url, latitude, longitude, operating_hours, entry_fee_detail, aliases, seed_favorite_count")
      .is("deleted_at", null)
      .not("name", "ilike", "%운영자%");

  if (clubsRes.error) {
    clubsRes = await supabase
      .from("clubs")
      .select("id, name, area, thumbnail_url, latitude, longitude")
      .is("deleted_at", null)
      .not("name", "ilike", "%운영자%");
  }

  const auctionsRes = await supabase
    .from("auctions")
    .select("club_id")
    .in("status", ["active", "scheduled"]);

  // 오늘 활성 HOT DEAL 슬롯 (이번 주 슬롯에서 오늘 요일 혜택 추출)
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dowIdx = kstNow.getUTCDay(); // 0=일~6=토
  const DOW_KEYS_KST = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const todayDowKey = DOW_KEYS_KST[dowIdx];
  const daysFromMonday = dowIdx === 0 ? 6 : dowIdx - 1;
  const thisMonday = new Date(kstNow);
  thisMonday.setUTCDate(kstNow.getUTCDate() - daysFromMonday);
  const thisWeekISO = thisMonday.toISOString().slice(0, 10);

  const hotdealRes = await supabase
    .from("weekly_hotdeal_slots")
    .select("club_id, benefits_by_dow, expires_at")
    .eq("week_start", thisWeekISO);

  // 클럽별 좋아요(찜) 수 — Migration 243의 공개 SELECT 정책 필요
  const favoritesRes = await supabase
    .from("user_favorite_clubs")
    .select("club_id");

  const HIDDEN_NAME_PATTERNS = [/luna/i, /prism/i, /eclipse/i, /^orion$/i];
  const clubs = (clubsRes.data ?? []).filter(
    (c: { name: string }) => !HIDDEN_NAME_PATTERNS.some((re) => re.test(c.name))
  );
  const activeCountMap: Record<string, number> = {};
  for (const a of auctionsRes.data ?? []) {
    if (!a.club_id) continue;
    activeCountMap[a.club_id] = (activeCountMap[a.club_id] || 0) + 1;
  }

  const hotdealMap: Record<string, string> = {};
  const benefitTagsMap: Record<string, string[]> = {};
  for (const h of hotdealRes.data ?? []) {
    if (!h.club_id) continue;
    if (new Date(h.expires_at) <= new Date()) continue;
    const byDow = (h.benefits_by_dow ?? {}) as HotdealBenefitsByDow;
    const todaySlots = normalizeDowSlots(byDow[todayDowKey as HotdealDow]);
    const summary = summarizeSlots(todaySlots);
    if (summary) {
      hotdealMap[h.club_id] = summary;
    }
    const tagSet = new Set<string>();
    for (const slot of todaySlots) {
      for (const b of slot.benefits ?? []) tagSet.add(b);
    }
    if (tagSet.size > 0) {
      benefitTagsMap[h.club_id] = [...tagSet];
    }
  }

  const favCountMap: Record<string, number> = {};
  // 실제 유저 찜
  for (const f of favoritesRes.data ?? []) {
    if (!f.club_id) continue;
    favCountMap[f.club_id] = (favCountMap[f.club_id] || 0) + 1;
  }
  // 시드 카운트 합산
  for (const c of clubs) {
    const seed = (c.seed_favorite_count as number | undefined) ?? 0;
    if (seed > 0) {
      favCountMap[c.id as string] = (favCountMap[c.id as string] || 0) + seed;
    }
  }

  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

  return (
    <div className="container mx-auto max-w-3xl px-4 pt-4 pb-8 mb-20">
      {/* 카카오맵 SDK 사전 연결/프리로드 — 지도 모드 진입 전에 네트워크 준비 */}
      <link rel="preconnect" href="https://dapi.kakao.com" crossOrigin="" />
      <link rel="dns-prefetch" href="https://dapi.kakao.com" />
      {kakaoKey && (
        <link
          rel="preload"
          as="script"
          href={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoKey}&autoload=false`}
        />
      )}
      <ClubsAdminFab />
      {/* SEO용 SSR 텍스트 — 화면엔 안 보이지만 검색엔진은 읽음.
          ClubList가 client-only라 SSR HTML에 클럽 이름이 빠지는 문제 보완. */}
      <div className="sr-only">
        <h1>전국 클럽 가이드 - 강남·홍대·이태원·부산·광주·대구 클럽 정보</h1>
        <p>
          나플(나이트플로우)에서 운영 중인 전국 클럽 목록입니다.
          강남, 홍대, 이태원, 부산, 광주, 대구 지역의 인기 클럽을
          한곳에서 둘러보고 핫딜·테이블 예약·일행 모집까지 한 번에 해결하세요.
        </p>
        <ul>
          {clubs.map((c: Record<string, unknown>) => {
            const name = c.name as string;
            const area = (c.area as string | null) ?? "";
            const aliases = (c.aliases as string[] | undefined) ?? [];
            const aliasText = aliases.length > 0 ? ` (${aliases.join(", ")})` : "";
            return (
              <li key={c.id as string}>
                {area ? `${area} ` : ""}{name}{aliasText}
              </li>
            );
          })}
        </ul>
      </div>
      <Suspense fallback={null}>
      <ClubList
        clubs={clubs.map((c: Record<string, unknown>) => ({
          id: c.id as string,
          name: c.name as string,
          area: (c.area as string | null) ?? null,
          thumbnail_url: (c.thumbnail_url as string | null) ?? null,
          tags: (c.tags as string[] | undefined) ?? [],
          drink_menu_url: (c.drink_menu_url as string | null | undefined) ?? null,
          latitude: (c.latitude as number | null | undefined) ?? null,
          longitude: (c.longitude as number | null | undefined) ?? null,
          operating_hours: (c.operating_hours as string | null | undefined) ?? null,
          entry_fee_detail: (c.entry_fee_detail as string | null | undefined) ?? null,
          aliases: (c.aliases as string[] | undefined) ?? [],
        }))}
        activeCountMap={activeCountMap}
        hotdealMap={hotdealMap}
        benefitTagsMap={benefitTagsMap}
        favCountMap={favCountMap}
      />
      </Suspense>
    </div>
  );
}
