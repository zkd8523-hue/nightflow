import { createServerClient } from "@supabase/ssr";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ArrowRight, Heart, MapPin } from "lucide-react";
import { getPrimaryAlias } from "@/lib/clubs/aliases";
import { ClubMap } from "@/components/clubs/ClubMap";

export const revalidate = 60;

// SEO 진입 전용 "지역 핫플 지도" 페이지.
// /hotplace/강남, /hotplace/홍대, /hotplace/이태원, /hotplace/부산, /hotplace/광주, /hotplace/대구
const SUPPORTED_AREAS = [
  "강남",
  "홍대",
  "이태원",
  "부산",
  "광주",
  "대구",
] as const;
type SupportedArea = (typeof SUPPORTED_AREAS)[number];

// 지도 초기 중심 — 지역 대표 좌표
const AREA_CENTERS: Record<SupportedArea, { lat: number; lng: number }> = {
  강남: { lat: 37.4979, lng: 127.0276 }, // 강남역
  홍대: { lat: 37.5563, lng: 126.9236 }, // 홍대입구
  이태원: { lat: 37.5345, lng: 126.9947 }, // 이태원역
  부산: { lat: 35.1379, lng: 129.0606 }, // 서면
  광주: { lat: 35.1595, lng: 126.8526 }, // 광주 상무
  대구: { lat: 35.8714, lng: 128.6014 }, // 대구 중구
};

interface PageProps {
  params: Promise<{ area: string }>;
}

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

function isSupportedArea(area: string): area is SupportedArea {
  return SUPPORTED_AREAS.includes(area as SupportedArea);
}

export async function generateStaticParams() {
  return SUPPORTED_AREAS.map((area) => ({ area }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { area: rawArea } = await params;
  const area = decodeURIComponent(rawArea);
  if (!isSupportedArea(area)) {
    notFound(); // HTTP 404 응답 (Soft 404 방지)
  }
  const title = `${area} 핫플 지도 - ${area} 클럽 위치·정보 한눈에`;
  const description = `${area} 핫플(핫플레이스) 클럽 지도. ${area} 인기 클럽의 위치, 영업시간, 게스트·무료입장, 테이블 가격 정보를 한곳에서 비교하세요. 강남·홍대 등 ${area} 클럽 추천은 나플(나이트플로우)에서.`;
  const canonical = `https://nightflow.kr/hotplace/${encodeURIComponent(area)}`;
  return {
    title,
    description,
    alternates: { canonical },
    keywords: [
      `${area} 핫플`,
      `${area} 핫플레이스`,
      `${area} 클럽 지도`,
      `${area} 클럽 위치`,
      `${area} 클럽 추천`,
      `${area} 인기 클럽`,
      `${area} 가볼만한 클럽`,
      `${area} 클럽`,
      `${area} 클럽 게스트`,
      `${area} 무료입장`,
      "핫플",
      "핫플레이스",
      "클럽 지도",
      "나플",
      "나이트플로우",
    ],
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      locale: "ko_KR",
      siteName: "NightFlow",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function HotplaceAreaPage({ params }: PageProps) {
  const { area: rawArea } = await params;
  const area = decodeURIComponent(rawArea);

  if (!isSupportedArea(area)) {
    notFound();
  }

  const supabase = createAnonClient();

  // 이번 주 게스트 간판 — 노출 판정은 week_start(getActiveWeekStartISO, 월 18시 게이트 포함) 단일 기준
  const { getActiveWeekStartISO } = await import("@/lib/utils/hotdeal");
  const thisWeekISO = getActiveWeekStartISO();

  // 지역의 활성 클럽 + 이번 주 게스트 간판 동시 조회
  const [{ data: clubsRaw }, { data: guestSignSlots }] = await Promise.all([
    supabase
      .from("clubs")
      .select(
        "id, name, area, thumbnail_url, latitude, longitude, tags, drink_menu_url, operating_hours, entry_fee_detail, seed_favorite_count"
      )
      .eq("area", area)
      .is("deleted_at", null)
      .not("name", "ilike", "%운영자%")
      .order("name")
      .limit(100),
    supabase
      .from("weekly_hotdeal_slots")
      .select("club_id")
      .eq("week_start", thisWeekISO),
  ]);

  // 게스트 간판 운영 중인 club_id Set
  const guestSignClubIds = new Set(
    (guestSignSlots ?? []).map((s) => s.club_id).filter(Boolean) as string[]
  );

  const HIDDEN = ["prism", "eclipse", "luna", "orion"];
  type ClubRow = {
    id: string;
    name: string;
    area: string | null;
    thumbnail_url: string | null;
    latitude: number | null;
    longitude: number | null;
    tags: string[] | null;
    drink_menu_url: string | null;
    operating_hours: string | null;
    entry_fee_detail: string | null;
    seed_favorite_count: number | null;
  };
  const areaClubsRaw = ((clubsRaw ?? []) as ClubRow[]).filter((c) => {
    const lower = c.name.toLowerCase();
    return !HIDDEN.some(
      (kw) => lower.startsWith(kw) || lower.includes(`club ${kw}`)
    );
  });

  // 게스트 간판 운영 중인 클럽 상위 노출 (안정 정렬로 기존 이름 순 유지)
  const areaClubs = [...areaClubsRaw].sort((a, b) => {
    const aHas = guestSignClubIds.has(a.id) ? 1 : 0;
    const bHas = guestSignClubIds.has(b.id) ? 1 : 0;
    return bHas - aHas;
  });

  // 지도에 표시 가능한 클럽 (좌표 있음)
  const mappedClubs = areaClubs.filter(
    (c) => c.latitude != null && c.longitude != null
  );
  const unmappedCount = areaClubs.length - mappedClubs.length;

  // 좋아요(찜) 수
  const visibleClubIds = areaClubs.map((c) => c.id);
  const { data: favRows } =
    visibleClubIds.length > 0
      ? await supabase
          .from("user_favorite_clubs")
          .select("club_id")
          .in("club_id", visibleClubIds)
      : { data: null };
  const favCountMap: Record<string, number> = {};
  for (const f of favRows ?? []) {
    if (!f.club_id) continue;
    favCountMap[f.club_id] = (favCountMap[f.club_id] || 0) + 1;
  }
  for (const c of areaClubs) {
    const seed = c.seed_favorite_count ?? 0;
    if (seed > 0) {
      favCountMap[c.id] = (favCountMap[c.id] || 0) + seed;
    }
  }
  const formatCount = (n: number): string => {
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return String(n);
  };

  // 활성 매물 카운트 (지도 마커용)
  const { data: auctionsRes } = await supabase
    .from("auctions")
    .select("club_id")
    .in("status", ["active", "scheduled"]);
  const activeCountMap: Record<string, number> = {};
  for (const a of auctionsRes ?? []) {
    if (!a.club_id) continue;
    activeCountMap[a.club_id] = (activeCountMap[a.club_id] || 0) + 1;
  }

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: "https://nightflow.kr/" },
      {
        "@type": "ListItem",
        position: 2,
        name: `${area} 핫플 지도`,
        item: `https://nightflow.kr/hotplace/${encodeURIComponent(area)}`,
      },
    ],
  };

  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 mb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {/* 카카오맵 SDK 사전 연결 */}
      <link rel="preconnect" href="https://dapi.kakao.com" crossOrigin="" />
      <link rel="dns-prefetch" href="https://dapi.kakao.com" />
      {kakaoKey && (
        <link
          rel="preload"
          as="script"
          href={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoKey}&autoload=false`}
        />
      )}

      {/* 시각 헤더 */}
      <header className="mb-5 space-y-1">
        <h1 className="text-2xl font-black text-white tracking-tight">
          {area} 핫플 지도
        </h1>
        <p className="text-sm text-neutral-400 leading-relaxed">
          {area} 클럽 {areaClubs.length}곳의 위치·정보를 한눈에. 게스트·무료입장·테이블 가격 비교
        </p>
      </header>

      {/* SEO sr-only — 헤드 키워드 보강 */}
      <div className="sr-only">
        <h2>{area} 핫플이란?</h2>
        <p>
          {area} 핫플(핫플레이스)은 {area} 지역에서 요즘 가장 인기 있는 클럽과
          장소를 의미합니다. 나플(나이트플로우)에서는 {area} 인기 클럽
          {areaClubs.length}곳의 위치 지도, 영업시간, 게스트·무료입장 혜택,
          테이블 가격 정보를 한곳에서 비교할 수 있습니다.
        </p>
        <h2>나플의 {area} 클럽 지도</h2>
        <p>
          {area} 핫플 클럽 추천·가볼만한 곳·인기 장소를 지도에서 한눈에
          확인하세요. {area} 클럽 위치, 근처 클럽 비교, 게스트 명단 등록,
          무료입장 가능 여부까지 나플에서.
        </p>
      </div>

      {/* 카카오맵 */}
      <section className="mb-6">
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl overflow-hidden">
          <ClubMap
            clubs={mappedClubs}
            activeCountMap={activeCountMap}
            initialCenter={AREA_CENTERS[area]}
            unmappedCount={unmappedCount}
            lockCenter
          />
        </div>
      </section>

      {/* 클럽 카드 리스트 */}
      {areaClubs.length > 0 && (
        <section className="space-y-3 mb-8">
          <h2 className="text-base font-bold text-white">
            {area} 핫플 클럽
            <span className="text-neutral-500 text-sm font-normal ml-2">
              ({areaClubs.length}곳)
            </span>
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {areaClubs.slice(0, 30).map((c) => {
              const primary = getPrimaryAlias(c.id);
              const display = primary ?? c.name;
              const altText = `${area} ${display} 클럽 사진`;
              const favCount = favCountMap[c.id] ?? 0;
              const hasGuestSign = guestSignClubIds.has(c.id);
              return (
                <li key={c.id}>
                  <Link
                    href={`/clubs/${c.id}`}
                    className={`block bg-[#1C1C1E] border rounded-xl overflow-hidden hover:bg-neutral-900 transition-colors ${
                      hasGuestSign ? "border-amber-500/40" : "border-neutral-800"
                    }`}
                  >
                    <div className="relative w-full aspect-[4/3] bg-neutral-900">
                      {c.thumbnail_url ? (
                        <Image
                          src={c.thumbnail_url}
                          alt={altText}
                          fill
                          sizes="(max-width: 512px) 50vw, 220px"
                          className="object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-neutral-700 text-2xl font-black">
                            {display.charAt(0)}
                          </span>
                        </div>
                      )}
                      {hasGuestSign && (
                        <div className="absolute top-2 left-2 bg-amber-500 px-1.5 py-0.5 rounded-md">
                          <span className="text-black text-[10px] font-black">게스트</span>
                        </div>
                      )}
                      {favCount > 0 && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-full">
                          <Heart className="w-3 h-3 fill-red-500 text-red-500" />
                          <span className="text-white text-[11px] font-bold">
                            {formatCount(favCount)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-white font-bold text-sm truncate">
                        {display}
                      </p>
                      <p className="text-neutral-500 text-[10px] mt-0.5 truncate">
                        {c.name}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 전체 보기 CTA */}
      <div className="pt-2 space-y-2">
        <Link href="/clubs">
          <Button
            variant="ghost"
            className="w-full bg-neutral-900 text-white font-bold rounded-2xl h-12 hover:bg-neutral-800"
          >
            <MapPin className="w-4 h-4 mr-1" />
            전국 클럽 가이드로 가기
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
