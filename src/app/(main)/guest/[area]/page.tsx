import { createServerClient } from "@supabase/ssr";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ArrowRight, Heart } from "lucide-react";
import { getPrimaryAlias } from "@/lib/clubs/aliases";
import { hideTestData } from "@/lib/utils/testData";
import {
  normalizeDowSlots,
  summarizeSlots,
  getActiveWeekStartISO,
} from "@/lib/utils/hotdeal";
import type { HotdealBenefitsByDow, HotdealDow } from "@/types/database";

export const revalidate = 60;

// SEO 진입 전용 "지역 클럽 게스트·무료입장" 페이지.
// /guest/강남, /guest/홍대, /guest/이태원, /guest/부산, /guest/광주, /guest/대구
const SUPPORTED_AREAS = [
  "강남",
  "홍대",
  "이태원",
  "부산",
  "광주",
  "대구",
] as const;
type SupportedArea = (typeof SUPPORTED_AREAS)[number];

const DOW_LABELS: Record<HotdealDow, string> = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
  sat: "토",
  sun: "일",
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
  const title = `${area} 클럽 게스트 - 무료입장·게스트 명단 정보`;
  const description = `${area} 클럽 게스트 입장·무료입장 정보 모음. ${area} 인기 클럽의 이번 주 게스트 간판, 요일별 무료입장 혜택, 게스트 명단을 한곳에서. 나플에서 ${area} 클럽 게스트 정보 확인.`;
  const canonical = `https://nightflow.kr/guest/${encodeURIComponent(area)}`;
  return {
    title,
    description,
    alternates: { canonical },
    keywords: [
      `${area} 클럽 게스트`,
      `${area} 게스트`,
      `${area} 무료입장`,
      `${area} 클럽 무료입장`,
      `${area} 게스트 명단`,
      `${area} 클럽 게스트 명단`,
      `${area} 클럽 입장`,
      "클럽 게스트",
      "클럽 무료입장",
      "게스트 명단",
      "무료입장",
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
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function GuestAreaPage({ params }: PageProps) {
  const { area: rawArea } = await params;
  const area = decodeURIComponent(rawArea);

  if (!isSupportedArea(area)) {
    notFound();
  }

  const supabase = createAnonClient();

  // 1. 지역의 활성 클럽 (테스트/가짜 숨김은 is_test 기준 SSOT, 프로덕션에서만)
  const { data: clubsRaw } = await hideTestData(
    supabase
      .from("clubs")
      .select("id, name, area, thumbnail_url, seed_favorite_count")
      .eq("area", area)
      .is("deleted_at", null),
    ""
  )
    .order("name")
    .limit(50);

  const areaClubs = ((clubsRaw ?? []) as Array<{
    id: string;
    name: string;
    area: string | null;
    thumbnail_url: string | null;
    seed_favorite_count: number | null;
  }>);

  // 2. 이번 주 게스트 간판 슬롯 — 클럽×요일 혜택 매트릭스
  const thisWeekISO = getActiveWeekStartISO();
  const visibleClubIds = areaClubs.map((c) => c.id);
  const { data: slotRows } = visibleClubIds.length > 0
    ? await supabase
        .from("weekly_hotdeal_slots")
        .select("club_id, benefits_by_dow")
        .eq("week_start", thisWeekISO)
        .in("club_id", visibleClubIds)
    : { data: null };

  // 클럽별 요일 게스트 정보 정리
  type GuestEntry = { dow: HotdealDow; text: string };
  const guestByClub: Record<string, GuestEntry[]> = {};
  for (const slot of slotRows ?? []) {
    if (!slot.club_id) continue;
    const byDow = (slot.benefits_by_dow ?? {}) as HotdealBenefitsByDow;
    const entries: GuestEntry[] = [];
    (Object.keys(DOW_LABELS) as HotdealDow[]).forEach((d) => {
      const slots = normalizeDowSlots(byDow[d]);
      const summary = summarizeSlots(slots);
      if (summary) entries.push({ dow: d, text: summary });
    });
    if (entries.length > 0) {
      guestByClub[slot.club_id] = entries;
    }
  }

  // 3. 좋아요(찜) 수
  const { data: favRows } = visibleClubIds.length > 0
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

  // 게스트 정보 있는 클럽 / 없는 클럽 분리 — 있는 쪽 상단 노출
  const clubsWithGuest = areaClubs.filter((c) => guestByClub[c.id]?.length);
  const clubsWithoutGuest = areaClubs.filter((c) => !guestByClub[c.id]?.length);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: "https://nightflow.kr/" },
      {
        "@type": "ListItem",
        position: 2,
        name: `${area} 클럽 게스트`,
        item: `https://nightflow.kr/guest/${encodeURIComponent(area)}`,
      },
    ],
  };

  return (
    <div className="container mx-auto max-w-lg px-4 py-6 mb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {/* SEO H1 */}
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-black text-white tracking-tight">
          {area} 클럽 게스트
        </h1>
        <p className="text-sm text-neutral-400 leading-relaxed">
          {area} 클럽 무료입장·게스트 명단·이번 주 게스트 간판 정보
        </p>
      </header>

      {/* SEO sr-only 본문 보강 */}
      <div className="sr-only">
        <h2>{area} 클럽 게스트 입장이란?</h2>
        <p>
          {area} 클럽 게스트 입장은 클럽 MD가 운영하는 게스트 명단에 등록되어
          무료입장 또는 할인 입장이 가능한 방식입니다. {area} 클럽 게스트
          간판은 매주 갱신되며 요일별로 무료입장 혜택, 프리드링크, 여성 무료
          등 다양한 옵션이 제공됩니다.
        </p>
        <h2>나플의 {area} 게스트 정보</h2>
        <p>
          나플에서 {area} 클럽 {areaClubs.length}곳의 이번 주 게스트 간판 정보를
          확인할 수 있습니다. {area} 클럽 무료입장 가능 여부, 게스트 명단 등록
          방법, 요일별 게스트 혜택을 한곳에서 비교하세요.
        </p>
      </div>

      {/* 게스트 간판 있는 클럽 */}
      {clubsWithGuest.length > 0 && (
        <section className="space-y-3 mb-8">
          <h2 className="text-base font-bold text-white">
            이번 주 {area} 게스트 간판
            <span className="text-neutral-500 text-sm font-normal ml-2">
              ({clubsWithGuest.length}곳)
            </span>
          </h2>
          <ul className="space-y-3">
            {clubsWithGuest.map((c) => {
              const primary = getPrimaryAlias(c.id);
              const display = primary ?? c.name;
              const entries = guestByClub[c.id];
              const altText = `${area} ${display} 게스트 간판`;
              const favCount = favCountMap[c.id] ?? 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/clubs/${c.id}`}
                    className="block bg-[#1C1C1E] border border-neutral-800 rounded-2xl overflow-hidden hover:bg-neutral-900 transition-colors"
                  >
                    <div className="flex gap-3 p-3">
                      <div className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-neutral-900">
                        {c.thumbnail_url ? (
                          <Image
                            src={c.thumbnail_url}
                            alt={altText}
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-neutral-700 text-lg font-black">
                              {display.charAt(0)}
                            </span>
                          </div>
                        )}
                        {favCount > 0 && (
                          <div className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                            <Heart className="w-2.5 h-2.5 fill-red-500 text-red-500" />
                            <span className="text-white text-[9px] font-bold">
                              {formatCount(favCount)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-white font-bold text-[15px] truncate">
                          {area} {display}
                        </p>
                        <p className="text-neutral-500 text-[11px] truncate">
                          {c.name}
                        </p>
                        <ul className="space-y-0.5 mt-1">
                          {entries.slice(0, 3).map((e) => (
                            <li
                              key={e.dow}
                              className="text-[11px] text-neutral-300 truncate"
                            >
                              <span className="text-amber-400 font-bold">
                                {DOW_LABELS[e.dow]}
                              </span>{" "}
                              {e.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 게스트 간판 없는 클럽 (영구 콘텐츠) */}
      {clubsWithoutGuest.length > 0 && (
        <section className="space-y-3 mb-8">
          <h2 className="text-base font-bold text-white">
            {area} 클럽
            <span className="text-neutral-500 text-sm font-normal ml-2">
              ({clubsWithoutGuest.length}곳)
            </span>
          </h2>
          <p className="text-[12px] text-neutral-500 leading-relaxed">
            이번 주 게스트 간판이 등록되지 않은 {area} 클럽. 클럽을 클릭해
            상세 정보를 확인하세요.
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {clubsWithoutGuest.slice(0, 20).map((c) => {
              const primary = getPrimaryAlias(c.id);
              const display = primary ?? c.name;
              const altText = `${area} ${display} 클럽 사진`;
              const favCount = favCountMap[c.id] ?? 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/clubs/${c.id}`}
                    className="block bg-[#1C1C1E] border border-neutral-800 rounded-xl overflow-hidden hover:bg-neutral-900 transition-colors"
                  >
                    <div className="relative w-full aspect-[4/3] bg-neutral-900">
                      {c.thumbnail_url ? (
                        <Image
                          src={c.thumbnail_url}
                          alt={altText}
                          fill
                          sizes="(max-width: 512px) 50vw, 220px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-neutral-700 text-2xl font-black">
                            {display.charAt(0)}
                          </span>
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
      <div className="pt-4">
        <Link href="/">
          <Button
            variant="ghost"
            className="w-full bg-neutral-900 text-white font-bold rounded-2xl h-12 hover:bg-neutral-800"
          >
            {area} 클럽 더 보기
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
