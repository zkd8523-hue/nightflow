import { createServerClient } from "@supabase/ssr";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Disc3, ChevronRight } from "lucide-react";
import { getBusinessDateISO } from "@/lib/lineups/time";
import { formatLineupDate } from "@/lib/lineups/formatDate";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import { LineupPageHeader } from "@/components/lineups/LineupPageHeader";
import { clubDisplayAlias, clubAllAliases } from "@/lib/clubs/seoAliases";
import type { Metadata } from "next";

// 지역별 라인업 — /lineups(전국, 1개)와 /clubs/[id]/lineup(클럽 하나)의 중간 계층.
// "홍대 클럽 라인업" 같은 검색어(구글 노출 최대 3,527의 "홍대 클럽"과 같은 계열)를
// 받을 자리가 그동안 없었다 — 전국은 범위가 너무 넓고 클럽 하나는 너무 좁았다.
//
// /lineups 자체(NationwideLineupList)를 재사용하지 않는다: 그 컴포넌트는 마운트 시
// router.replace("/lineups?area=...")로 항상 자기 경로로 되돌아가서, 이 페이지에
// 얹으면 곧바로 /lineups로 리다이렉트돼 버린다. 그래서 /hotplace/[area]와 같은
// 서버 렌더 전용 패턴을 쓴다.
export const revalidate = 60;

// 라인업 5건 미만 지역은 thin content라 제외(실측 2026-08-29 기준 대전 1건·광주 4건).
// 빈 페이지를 만들면 구글이 사이트 전체 품질을 낮게 본다.
const SUPPORTED_AREAS = ["이태원", "홍대", "강남", "부산", "대구", "수원"] as const;
type SupportedArea = (typeof SUPPORTED_AREAS)[number];

function isSupportedArea(area: string): area is SupportedArea {
  return (SUPPORTED_AREAS as readonly string[]).includes(area);
}

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

interface ClubRef {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  is_test: boolean;
  status: string;
  deleted_at: string | null;
  aliases: string[] | null;
}

interface DjRef {
  id: string;
  display_name: string;
}

interface RawRow {
  id: string;
  event_date: string;
  club_id: string;
  event_title: string | null;
  clubs: ClubRef | ClubRef[] | null;
  lineup_sets: Array<{ sort_order: number; djs: DjRef | DjRef[] | null }> | null;
}

function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export async function generateStaticParams() {
  return SUPPORTED_AREAS.map((area) => ({ area }));
}

type AreaLineupRow = {
  id: string;
  event_date: string;
  event_title: string | null;
  club: ClubRef;
  djNames: string[];
};

function toAreaRows(raw: RawRow[], area: string): AreaLineupRow[] {
  const rows: AreaLineupRow[] = [];
  for (const r of raw) {
    const club = firstOf(r.clubs);
    if (!club) continue;
    if (!SHOW_TEST_DATA && club.is_test) continue;
    if (club.deleted_at) continue;
    if (club.status !== "approved") continue;
    if (club.area !== area) continue;

    const sets = [...(r.lineup_sets ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const djNames = sets.map((s) => firstOf(s.djs)?.display_name).filter((n): n is string => !!n);

    rows.push({ id: r.id, event_date: r.event_date, event_title: r.event_title, club, djNames });
  }
  return rows;
}

async function fetchAreaLineups(area: string) {
  const supabase = createAnonClient();
  const today = getBusinessDateISO();

  const selectCols = `id, event_date, club_id, event_title,
       clubs(id, name, area, thumbnail_url, is_test, status, deleted_at, aliases),
       lineup_sets(sort_order, djs(id, display_name))`;

  // 예정만 보여주면 대구·강남·수원처럼 라인업이 적은 지역은 날짜가 지나면서
  // 금방 빈 페이지가 된다(공연 지역 페이지와 같은 이유로 지난 라인업도 포함).
  const since90 = new Date(Date.now() + 9 * 3600 * 1000 - 90 * 86400000)
    .toISOString()
    .slice(0, 10);

  const [{ data: upcomingRaw }, { data: pastRaw }] = await Promise.all([
    supabase
      .from("club_lineups")
      .select(selectCols)
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(300),
    supabase
      .from("club_lineups")
      .select(selectCols)
      .gte("event_date", since90)
      .lt("event_date", today)
      .order("event_date", { ascending: false })
      .limit(150),
  ]);

  return {
    upcoming: toAreaRows((upcomingRaw ?? []) as unknown as RawRow[], area),
    past: toAreaRows((pastRaw ?? []) as unknown as RawRow[], area),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { area: rawArea } = await params;
  const area = decodeURIComponent(rawArea);
  if (!isSupportedArea(area)) notFound();

  // 이 지역 클럽들의 한글 대표명을 몇 개 뽑아 제목·설명에 자연스럽게 실어준다.
  // 감사 결과 이 페이지는 클럽 별칭을 정적·DB 어느 쪽도 안 읽어서 "이태원 볼레로"
  // 같은 클럽별 롱테일을 하나도 못 받고 있었다.
  const { upcoming, past } = await fetchAreaLineups(area);
  const clubsInArea = Array.from(
    new Map([...upcoming, ...past].map((r) => [r.club.id, r.club])).values()
  );
  const displayAliases = clubsInArea
    .map((c) => clubDisplayAlias({ id: c.id, name: c.name, aliases: c.aliases }))
    .filter((a): a is string => !!a)
    .slice(0, 6);
  const aliasText = displayAliases.length > 0 ? ` ${displayAliases.join(", ")} 등.` : "";

  const title = `${area} 클럽 라인업 - 오늘 밤 DJ 타임테이블`;
  const description = `${area} 클럽의 DJ 라인업과 공연 일정을 날짜별로 모았습니다.${aliasText} 클럽별 타임테이블, 오늘 누가 트는지 나플에서 확인하세요.`;
  const canonical = `https://nightflow.kr/lineups/${encodeURIComponent(area)}`;
  return {
    title,
    description,
    alternates: { canonical },
    keywords: [
      `${area} 클럽 라인업`,
      `${area} DJ 라인업`,
      `${area} 클럽 DJ`,
      `${area} 클럽 타임테이블`,
      `${area} 클럽`,
      "DJ 라인업",
      "클럽 타임테이블",
      "나플",
      "나이트플로우",
      ...clubsInArea.flatMap((c) => clubAllAliases({ id: c.id, name: c.name, aliases: c.aliases })),
    ],
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

function groupByDate(rows: AreaLineupRow[]): Array<[string, AreaLineupRow[]]> {
  const map = new Map<string, AreaLineupRow[]>();
  for (const r of rows) {
    const list = map.get(r.event_date);
    if (list) list.push(r);
    else map.set(r.event_date, [r]);
  }
  return [...map.entries()];
}

function LineupDateGroup({ date, list }: { date: string; list: AreaLineupRow[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold text-foreground">{formatLineupDate(date)}</h2>
      <div className="space-y-2">
        {list.map((r) => (
          <Link
            key={r.id}
            href={`/clubs/${r.club.id}/lineup/${r.event_date}`}
            className="flex items-center gap-3 bg-[#1C1C1E] rounded-2xl p-3 hover:bg-[#232326] transition-colors"
          >
            {r.club.thumbnail_url ? (
              <Image
                src={r.club.thumbnail_url}
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
              <p className="text-sm font-bold text-foreground truncate">
                {r.club.name}
                {r.event_title && (
                  <span className="ml-1.5 text-amber-400 font-normal">〈{r.event_title}〉</span>
                )}
              </p>
              {r.djNames.length > 0 && (
                <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                  {r.djNames.join(" · ")}
                </p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function AreaLineupsPage({ params }: PageProps) {
  const { area: rawArea } = await params;
  const area = decodeURIComponent(rawArea);
  if (!isSupportedArea(area)) notFound();

  const { upcoming, past } = await fetchAreaLineups(area);
  const upcomingGroups = groupByDate(upcoming);
  const pastGroups = groupByDate(past);
  const isEmpty = upcoming.length === 0 && past.length === 0;

  // SEO용 sr-only 문구 — 화면엔 안 보이지만 검색엔진은 읽는다. 카드는 영문
  // 등록명 그대로 두고(화면 UI는 안 바꾸기로 결정), 여기서만 이 지역 클럽들의
  // 한글 대표명을 문장으로 노출해 "이태원 볼레로" 같은 클럽별 롱테일을 받는다.
  const clubsInArea = Array.from(
    new Map([...upcoming, ...past].map((r) => [r.club.id, r.club])).values()
  );
  const areaClubSentence = clubsInArea
    .map((c) => {
      const primary = clubDisplayAlias({ id: c.id, name: c.name, aliases: c.aliases });
      return primary ? `${primary}(${c.name})` : c.name;
    })
    .join(", ");

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: "https://nightflow.kr/" },
      { "@type": "ListItem", position: 2, name: "전국 DJ 라인업", item: "https://nightflow.kr/lineups" },
      {
        "@type": "ListItem",
        position: 3,
        name: `${area} 클럽 라인업`,
        item: `https://nightflow.kr/lineups/${encodeURIComponent(area)}`,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <div className="min-h-screen bg-[#0A0A0A] pb-24">
        <div className="max-w-lg lg:max-w-4xl mx-auto px-4 pt-6 space-y-5">
          <LineupPageHeader active="lineups" />

          {areaClubSentence && (
            <p className="sr-only">
              {area} 클럽 라인업 — {areaClubSentence} 등 {area} 클럽의 DJ 타임테이블을
              나플에서 날짜별로 확인하세요.
            </p>
          )}

          <div>
            <h1 className="text-[26px] font-black tracking-tight leading-tight break-keep text-foreground">
              {area} 클럽 라인업
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              {area} 클럽의 DJ 타임테이블을 날짜별로 모았습니다.
            </p>
          </div>

          {isEmpty ? (
            <div className="text-center py-16">
              <p className="text-[15px] font-bold text-foreground">
                {area}엔 아직 등록된 라인업이 없어요
              </p>
              <Link href="/lineups" className="inline-block mt-3 text-[13px] text-amber-400">
                전국 라인업 보기 →
              </Link>
            </div>
          ) : (
            <>
              {upcomingGroups.length > 0 && (
                <div className="space-y-5">
                  <p className="text-[12px] font-bold text-muted-foreground -mb-2">다가오는 라인업</p>
                  {upcomingGroups.map(([date, list]) => (
                    <LineupDateGroup key={date} date={date} list={list} />
                  ))}
                </div>
              )}
              {pastGroups.length > 0 && (
                <div className="space-y-5">
                  <p className="text-[12px] font-bold text-muted-foreground -mb-2">지난 라인업</p>
                  {pastGroups.map(([date, list]) => (
                    <LineupDateGroup key={date} date={date} list={list} />
                  ))}
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Link
              href={`/hotplace/${encodeURIComponent(area)}`}
              className="text-center bg-[#1C1C1E] rounded-2xl p-3 text-[13px] font-bold text-foreground hover:bg-[#232326] transition-colors"
            >
              {area} 클럽 총정리
            </Link>
            <Link
              href="/lineups"
              className="text-center bg-[#1C1C1E] rounded-2xl p-3 text-[13px] font-bold text-foreground hover:bg-[#232326] transition-colors"
            >
              전국 라인업 보기
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
