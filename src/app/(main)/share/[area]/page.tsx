import { createServerClient } from "@supabase/ssr";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ArrowRight, Heart } from "lucide-react";
import { getPrimaryAlias } from "@/lib/clubs/aliases";

export const revalidate = 60;

// SEO 진입 전용 지역 조각 페이지.
// /share/강남, /share/홍대, /share/이태원, /share/부산, /share/광주, /share/대구
const SUPPORTED_AREAS = [
  "강남",
  "홍대",
  "이태원",
  "부산",
  "광주",
  "대구",
] as const;
type SupportedArea = (typeof SUPPORTED_AREAS)[number];

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
  const title = `${area} 조각 - ${area} 클럽 조각·합석 일행 모집`;
  const description = `${area} 클럽 조각 매물 모음. ${area} 클럽 인당 가격으로 같이 갈 일행을 모집·합류하세요. ${area} 인기 클럽 정보와 진행 중인 조각·합석 매물을 한곳에. 나플에서 확인.`;
  const canonical = `https://nightflow.kr/share/${encodeURIComponent(area)}`;
  return {
    title,
    description,
    alternates: { canonical },
    keywords: [
      `${area} 조각`,
      `${area} 클럽 조각`,
      `${area} 클럽 합석`,
      `${area} 합석`,
      `${area} 클럽 일행`,
      `${area} 일행`,
      `${area} 조각모임`,
      `${area} 클럽`,
      "클럽 조각",
      "클럽 합석",
      "클럽 일행",
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

export default async function ShareAreaPage({ params }: PageProps) {
  const { area: rawArea } = await params;
  const area = decodeURIComponent(rawArea);

  if (!isSupportedArea(area)) {
    notFound();
  }

  const supabase = createAnonClient();
  const nowIso = new Date().toISOString();

  // 1. 지역의 진행 중 share 매물
  const { data: shareRows } = await supabase
    .from("auctions")
    .select(
      `
      id, title, start_price, table_info, share_deadline,
      club:clubs(id, name, area)
    `
    )
    .eq("listing_type", "share")
    .in("status", ["active", "scheduled"])
    .gt("share_deadline", nowIso)
    .order("share_deadline", { ascending: true })
    .limit(50);

  const shareItems = (shareRows ?? []).filter((r) => {
    const club = r.club as unknown as { area?: string | null } | null;
    return club?.area === area;
  });

  // 2. 지역의 활성 클럽 (영구 콘텐츠 — 매물 없을 때도 SEO 본문 풍부)
  const { data: clubsRaw } = await supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url, seed_favorite_count")
    .eq("area", area)
    .is("deleted_at", null)
    .not("name", "ilike", "%운영자%")
    .order("name")
    .limit(50);

  const HIDDEN = ["prism", "eclipse", "luna", "orion"];
  const areaClubs = ((clubsRaw ?? []) as Array<{
    id: string;
    name: string;
    area: string | null;
    thumbnail_url: string | null;
    seed_favorite_count: number | null;
  }>).filter((c) => {
    const lower = c.name.toLowerCase();
    return !HIDDEN.some(
      (kw) => lower.startsWith(kw) || lower.includes(`club ${kw}`)
    );
  });

  // 3. 클럽별 좋아요(찜) 수 — Migration 243의 공개 SELECT 정책
  // 시각 클럽 ID 화이트리스트만 카운트해서 쿼리 비용 줄임.
  const visibleClubIds = areaClubs.map((c) => c.id);
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
  // 시드 카운트 합산 (메인 /clubs 페이지와 동일 정책)
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

  const formatPrice = (n: number) =>
    new Intl.NumberFormat("ko-KR").format(n);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: "https://nightflow.kr/" },
      {
        "@type": "ListItem",
        position: 2,
        name: `${area} 조각`,
        item: `https://nightflow.kr/share/${encodeURIComponent(area)}`,
      },
    ],
  };

  return (
    <div className="container mx-auto max-w-lg px-4 py-6 mb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {/* SEO H1 — 시각엔 작게 표시되지만 검색엔진엔 강한 신호 */}
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-black text-white tracking-tight">
          {area} 조각
        </h1>
        <p className="text-sm text-neutral-400 leading-relaxed">
          {area} 클럽 조각·합석 일행 모집 매물 모음
        </p>
      </header>

      {/* SEO sr-only — 본문 텍스트 보강 */}
      <div className="sr-only">
        <h2>{area} 조각이란?</h2>
        <p>
          {area} 조각은 {area} 클럽에 같이 갈 일행을 모집하거나 합류하는
          방식입니다. {area} 클럽 MD가 인당 가격으로 조각 매물을 올리면 회원이
          한 자리씩 합류해서 같이 입장합니다. 클럽 조각·합석으로 부르기도
          합니다.
        </p>
        <h2>나플 {area} 조각</h2>
        <p>
          나플에서 {area} 조각 매물 {shareItems.length}건이 진행
          중입니다. {area} 인기 클럽 {areaClubs.length}곳에서 조각·합석·일행
          모집이 가능합니다.
        </p>
      </div>

      {/* 진행 중인 조각 매물 */}
      <section className="space-y-3 mb-8">
        <h2 className="text-base font-bold text-white">
          모집 중인 {area} 조각
          {shareItems.length > 0 && (
            <span className="text-neutral-500 text-sm font-normal ml-2">
              ({shareItems.length}건)
            </span>
          )}
        </h2>
        {shareItems.length === 0 ? (
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-6 text-center">
            <p className="text-neutral-400 text-sm mb-2 leading-relaxed">
              현재 진행 중인 {area} 조각 매물이 없어요
            </p>
            <p className="text-neutral-500 text-xs mb-5 leading-relaxed">
              {area} 무료입장·특가 등 실시간 정보를 확인해보실래요?
            </p>
            <Link href="/">
              <Button className="bg-amber-500 text-black font-black rounded-full hover:bg-amber-400 h-12 px-6">
                둘러보기
              </Button>
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {shareItems.map((item) => {
              const club = item.club as unknown as {
                id: string;
                name: string;
                area: string | null;
              };
              const primary = getPrimaryAlias(club.id);
              const head = primary
                ? `${club.area ? `${club.area} ` : ""}${primary}(${club.name})`
                : `${club.area ? `${club.area} ` : ""}${club.name}`;
              return (
                <li key={item.id}>
                  <Link
                    href={`/auctions/${item.id}`}
                    className="block bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 hover:bg-neutral-900 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-[15px] truncate">
                          {head}
                        </p>
                        {item.title && (
                          <p className="text-neutral-400 text-xs mt-1 line-clamp-2">
                            {item.title}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-green-500 font-black text-base">
                          ₩{formatPrice(item.start_price)}
                        </p>
                        <p className="text-neutral-500 text-[10px]">1인</p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 지역 인기 클럽 — 영구 콘텐츠 */}
      {areaClubs.length > 0 && (
        <section className="space-y-3 mb-8">
          <h2 className="text-base font-bold text-white">
            {area} 인기 클럽
            <span className="text-neutral-500 text-sm font-normal ml-2">
              ({areaClubs.length}곳)
            </span>
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {areaClubs.slice(0, 20).map((c) => {
              const primary = getPrimaryAlias(c.id);
              const display = primary ?? c.name;
              const altText = `${area} ${display}${
                primary && primary !== c.name ? ` (${c.name})` : ""
              } 클럽 사진`;
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
            전체 조각 보기
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
