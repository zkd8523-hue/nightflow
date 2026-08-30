import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Disc3, ChevronRight } from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { formatLineupDate } from "@/lib/lineups/formatDate";
import { getBusinessDateISO } from "@/lib/lineups/time";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import { clubDisplayAlias, clubAllAliases } from "@/lib/clubs/seoAliases";
import type { Metadata } from "next";

// 클럽별 라인업 허브 — 날짜별 라인업(/clubs/[id]/lineup/[date], 148개)의 부모.
// 부모가 없으면 크롤러가 날짜 페이지에서 한 단계 올라왔을 때 404를 맞는다
// (events/[date]가 이미 같은 이유로 존재하는 것과 동일한 문제였다).
//
// "클럽명 라인업"(헤드 다음가는 롱테일)을 받는 자리이기도 하다 — 날짜 페이지는
// "클럽명 8월 30일 라인업"처럼 날짜가 붙어야만 잡히고, 클럽 상세는 오늘 하루치만
// 보여줘서 "그 클럽에 라인업이 쌓여 있다"는 사실 자체를 못 보여준다.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface DjRef {
  id: string;
  slug: string;
  display_name: string;
}

interface RawLineupRow {
  id: string;
  event_date: string;
  event_title: string | null;
  lineup_sets: Array<{
    sort_order: number;
    djs: DjRef | DjRef[] | null;
  }> | null;
}

interface LineupDateRow {
  id: string;
  event_date: string;
  event_title: string | null;
  djNames: string[];
}

function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function toRows(raw: RawLineupRow[] | null): LineupDateRow[] {
  return (raw ?? []).map((r) => {
    const sets = [...(r.lineup_sets ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const djNames = sets
      .map((s) => firstOf(s.djs)?.display_name)
      .filter((n): n is string => !!n);
    return { id: r.id, event_date: r.event_date, event_title: r.event_title, djNames };
  });
}

async function fetchClubLineups(clubId: string) {
  const supabase = await createClient();

  const clubQuery = supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url, aliases")
    .eq("id", clubId)
    .is("deleted_at", null);
  if (!SHOW_TEST_DATA) clubQuery.eq("status", "approved");
  const { data: club } = await clubQuery.single();
  if (!club) return null;

  const today = getBusinessDateISO();

  const [{ data: upcomingRaw }, { data: pastRaw }] = await Promise.all([
    supabase
      .from("club_lineups")
      .select("id, event_date, event_title, lineup_sets(sort_order, djs(id, slug, display_name))")
      .eq("club_id", clubId)
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(60),
    supabase
      .from("club_lineups")
      .select("id, event_date, event_title, lineup_sets(sort_order, djs(id, slug, display_name))")
      .eq("club_id", clubId)
      .lt("event_date", today)
      .order("event_date", { ascending: false })
      .limit(30),
  ]);

  const upcoming = toRows(upcomingRaw as unknown as RawLineupRow[]);
  const past = toRows(pastRaw as unknown as RawLineupRow[]);

  return { club, upcoming, past };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchClubLineups(id);
  if (!result) return {};
  const { club, upcoming, past } = result;

  // 정적 큐레이션 우선 → DB 첫 한글 폴백. 없으면 등록명만 쓴다(폴백은
  // clubDisplayAlias 내부에서 처리).
  const primary = clubDisplayAlias({ id, name: club.name, aliases: club.aliases });
  const areaPrefix = club.area ? `${club.area} ` : "";
  const headName = primary
    ? `${areaPrefix}${primary}(${club.name})`
    : `${areaPrefix}${club.name}`;
  const aliases = clubAllAliases({ id, name: club.name, aliases: club.aliases });

  const allDjNames = Array.from(
    new Set([...upcoming, ...past].flatMap((r) => r.djNames))
  ).slice(0, 6);
  const djText = allDjNames.length > 0 ? ` ${allDjNames.join(", ")} 등이 뛴다.` : "";

  const title = `${headName} 라인업 - DJ 타임테이블·공연 일정`;
  const description =
    upcoming.length > 0
      ? `${headName} DJ 라인업. 다가오는 무대 ${upcoming.length}건.${djText} 날짜별 타임테이블을 나플에서 확인하세요.`
      : `${headName} DJ 라인업 기록.${djText} 지난 타임테이블을 나플에서 확인하세요.`;

  const url = `https://nightflow.kr/clubs/${id}/lineup`;
  return {
    title,
    description,
    keywords: [
      club.name,
      ...aliases,
      `${club.name} 라인업`,
      `${club.name} DJ`,
      `${club.name} 타임테이블`,
      `${club.name} 공연`,
      ...(club.area ? [`${club.area} 클럽 라인업`, `${club.area} DJ 공연`] : []),
      ...aliases.map((a) => `${a} 라인업`),
      ...allDjNames.map((n) => `${n} 라인업`),
    ],
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: club.thumbnail_url
        ? [{ url: club.thumbnail_url }]
        : [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
    },
  };
}

export default async function ClubLineupHubPage({ params }: PageProps) {
  const { id } = await params;
  const result = await fetchClubLineups(id);
  if (!result) notFound();
  const { club, upcoming, past } = result;

  // 라인업 0건 클럽은 thin content라 통째로 404 — DJ 페이지·날짜 페이지와 같은 규약.
  if (upcoming.length === 0 && past.length === 0) notFound();

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: "https://nightflow.kr/" },
      { "@type": "ListItem", position: 2, name: "전국 DJ 라인업", item: "https://nightflow.kr/lineups" },
      ...(club.area
        ? [
            {
              "@type": "ListItem",
              position: 3,
              name: `${club.area} 클럽 라인업`,
              item: `https://nightflow.kr/lineups/${encodeURIComponent(club.area)}`,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: club.area ? 4 : 3,
        name: `${club.name} 라인업`,
        item: `https://nightflow.kr/clubs/${id}/lineup`,
      },
    ],
  };

  function DateCard({ row }: { row: LineupDateRow }) {
    return (
      <Link
        key={row.id}
        href={`/clubs/${id}/lineup/${row.event_date}`}
        className="flex items-center gap-3 bg-[#1C1C1E] rounded-2xl p-3 hover:bg-[#232326] transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">
            {formatLineupDate(row.event_date)}
            {row.event_title && (
              <span className="ml-1.5 text-amber-400 font-normal">〈{row.event_title}〉</span>
            )}
          </p>
          {row.djNames.length > 0 && (
            <p className="text-[12px] text-muted-foreground truncate mt-0.5">
              {row.djNames.join(" · ")}
            </p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <div className="min-h-screen bg-[#0A0A0A] pb-24">
        <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
          <BackButton fallbackHref={`/clubs/${id}`} />

          <div>
            <p className="text-[12px] font-bold text-muted-foreground mb-1">
              {club.area ? `${club.area} · ` : ""}DJ 라인업
            </p>
            <h1 className="text-[28px] font-black tracking-tight leading-tight break-keep text-foreground">
              {club.name} 라인업
            </h1>
          </div>

          <Link
            href={`/clubs/${id}`}
            aria-label={`${club.name} 클럽 정보 보기`}
            className="flex items-center gap-3 bg-[#1C1C1E] rounded-2xl p-3 hover:bg-[#232326] transition-colors"
          >
            {club.thumbnail_url ? (
              <Image
                src={club.thumbnail_url}
                alt=""
                width={44}
                height={44}
                className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
              />
            ) : (
              <span className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                <Disc3 className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate">클럽 정보 보기</p>
              <p className="text-[11px] text-muted-foreground">
                위치 · 영업시간 · 가격표 · 입장료
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          </Link>

          {upcoming.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-foreground">다가오는 라인업</h2>
              <div className="space-y-2">
                {upcoming.map((row) => (
                  <DateCard key={row.id} row={row} />
                ))}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-foreground">지난 라인업</h2>
              <div className="space-y-2">
                {past.map((row) => (
                  <DateCard key={row.id} row={row} />
                ))}
              </div>
            </div>
          )}

          {club.area && (
            <Link
              href={`/lineups/${encodeURIComponent(club.area)}`}
              className="block text-center text-[12px] text-muted-foreground hover:text-foreground py-2"
            >
              {club.area} 다른 클럽 라인업 보기 →
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
