import { createServerClient } from "@supabase/ssr";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Mic2 } from "lucide-react";
import { eventSlug } from "@/lib/events/slug";
import { formatLineupDate } from "@/lib/lineups/formatDate";
import { LineupPageHeader } from "@/components/lineups/LineupPageHeader";
import type { Metadata } from "next";

// 지역별 공연 — /events(전국)와 /events/{date}/{slug}(공연 하나)의 중간 계층.
// URL을 /events/[area]가 아니라 /events/area/[area]로 둔 이유: /events/[date]가
// 이미 같은 자리(1단계 밑)의 동적 세그먼트를 쓰고 있어서, 이름이 다른 두 동적
// 폴더([date]와 [area])는 같은 깊이에 공존할 수 없다(Next.js 라우팅 제약).
// 정적 "area" 세그먼트로 한 단 내려서 충돌을 피한다.
export const revalidate = 60;

// 실측 공연 5건 미만 지역은 thin content라 제외(2026-08-29 기준 광주 4·대구 4).
// 외국 도시(타이페이·도쿄)는 한국어 트랙 소관이 아니라 제외.
const SUPPORTED_AREAS = ["홍대", "이태원", "서울", "강남", "대전", "부산"] as const;
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
  is_test: boolean;
  status: string;
  deleted_at: string | null;
}

interface PerformerRef {
  raw_name: string;
  sort_order: number;
  artists: { display_name: string } | { display_name: string }[] | null;
}

interface RawRow {
  id: string;
  event_date: string;
  title: string | null;
  club_id: string | null;
  club_name_raw: string;
  venue_area: string | null;
  clubs: ClubRef | ClubRef[] | null;
  club_event_performers: PerformerRef[] | null;
}

function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function generateStaticParams() {
  return SUPPORTED_AREAS.map((area) => ({ area }));
}

type EventRow = {
  id: string;
  event_date: string;
  title: string;
  venueName: string;
  performerNames: string[];
};

function toRows(raw: RawRow[]): EventRow[] {
  const rows: EventRow[] = [];
  for (const r of raw) {
    const club = firstOf(r.clubs);
    if (club && (club.is_test || club.deleted_at || club.status !== "approved")) continue;
    if (!r.title) continue;

    const performerNames = [...(r.club_event_performers ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => firstOf(p.artists)?.display_name ?? p.raw_name)
      .filter(Boolean);

    rows.push({
      id: r.id,
      event_date: r.event_date,
      title: r.title,
      venueName: club?.name ?? r.club_name_raw,
      performerNames,
    });
  }
  return rows;
}

async function fetchAreaEvents(area: string) {
  const supabase = createAnonClient();
  const today = todayKST();

  // 예정만 보여주면 대부분의 지역·시점에서 빈 페이지가 된다 — 전체 승인 공연 500건 중
  // "다가오는" 건 시스템 전체를 통틀어 23건뿐이다(실측 2026-08-29). 클럽 라인업 허브가
  // 지난 라인업까지 보여주는 것과 같은 이유로, 최근 90일 지난 공연도 함께 낸다.
  const since90 = new Date(Date.now() + 9 * 3600 * 1000 - 90 * 86400000)
    .toISOString()
    .slice(0, 10);

  const selectCols = `id, event_date, title, club_id, club_name_raw, venue_area,
       clubs(id, name, is_test, status, deleted_at),
       club_event_performers(raw_name, sort_order, artists(display_name))`;

  const [{ data: upcomingRaw }, { data: pastRaw }] = await Promise.all([
    supabase
      .from("club_events")
      .select(selectCols)
      .eq("status", "approved")
      .eq("venue_area", area)
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(100),
    supabase
      .from("club_events")
      .select(selectCols)
      .eq("status", "approved")
      .eq("venue_area", area)
      .gte("event_date", since90)
      .lt("event_date", today)
      .order("event_date", { ascending: false })
      .limit(100),
  ]);

  return {
    upcoming: toRows((upcomingRaw ?? []) as unknown as RawRow[]),
    past: toRows((pastRaw ?? []) as unknown as RawRow[]),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { area: rawArea } = await params;
  const area = decodeURIComponent(rawArea);
  if (!isSupportedArea(area)) notFound();

  const title = `${area} 공연 일정 - 클럽 힙합·라이브 라인업`;
  const description = `${area} 클럽·공연장의 힙합·라이브 공연 일정. 대형 기획사 홍보가 안 붙는 공연까지 나플에서 날짜별로 확인하세요.`;
  const canonical = `https://nightflow.kr/events/area/${encodeURIComponent(area)}`;
  return {
    title,
    description,
    alternates: { canonical },
    keywords: [
      `${area} 공연`,
      `${area} 공연 일정`,
      `${area} 힙합 공연`,
      `${area} 클럽 공연`,
      `${area} 라이브`,
      "언더그라운드 공연",
      "나플",
      "나이트플로우",
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

function groupByDate(rows: EventRow[]): Array<[string, EventRow[]]> {
  const map = new Map<string, EventRow[]>();
  for (const r of rows) {
    const list = map.get(r.event_date);
    if (list) list.push(r);
    else map.set(r.event_date, [r]);
  }
  return [...map.entries()];
}

function EventDateGroup({ date, list }: { date: string; list: EventRow[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold text-foreground">{formatLineupDate(date)}</h2>
      <div className="space-y-2">
        {list.map((r) => (
          <Link
            key={r.id}
            href={`/events/${r.event_date}/${eventSlug(r.title)}`}
            className="flex items-center gap-3 bg-[#1C1C1E] rounded-2xl p-3 hover:bg-[#232326] transition-colors"
          >
            <span className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
              <Mic2 className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate">{r.title}</p>
              <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                {r.venueName}
                {r.performerNames.length > 0 ? ` · ${r.performerNames.join(", ")}` : ""}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function AreaEventsPage({ params }: PageProps) {
  const { area: rawArea } = await params;
  const area = decodeURIComponent(rawArea);
  if (!isSupportedArea(area)) notFound();

  const { upcoming, past } = await fetchAreaEvents(area);
  const upcomingGroups = groupByDate(upcoming); // 이미 오름차순 정렬된 상태로 들어온다
  const pastGroups = groupByDate(past); // 이미 내림차순 정렬된 상태로 들어온다
  const isEmpty = upcoming.length === 0 && past.length === 0;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: "https://nightflow.kr/" },
      { "@type": "ListItem", position: 2, name: "공연 일정", item: "https://nightflow.kr/events" },
      {
        "@type": "ListItem",
        position: 3,
        name: `${area} 공연`,
        item: `https://nightflow.kr/events/area/${encodeURIComponent(area)}`,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <div className="min-h-screen bg-[#0A0A0A] pb-24">
        <div className="max-w-lg lg:max-w-4xl mx-auto px-4 pt-6 space-y-5">
          <LineupPageHeader active="events" />

          <div>
            <h1 className="text-[26px] font-black tracking-tight leading-tight break-keep text-foreground">
              {area} 공연 일정
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              {area} 클럽·공연장의 힙합·라이브 공연을 날짜별로 모았습니다.
            </p>
          </div>

          {isEmpty ? (
            <div className="text-center py-16">
              <p className="text-[15px] font-bold text-foreground">
                {area}엔 아직 등록된 공연이 없어요
              </p>
              <Link href="/events" className="inline-block mt-3 text-[13px] text-pink-400">
                전체 공연 보기 →
              </Link>
            </div>
          ) : (
            <>
              {upcomingGroups.length > 0 && (
                <div className="space-y-5">
                  <p className="text-[12px] font-bold text-muted-foreground -mb-2">다가오는 공연</p>
                  {upcomingGroups.map(([date, list]) => (
                    <EventDateGroup key={date} date={date} list={list} />
                  ))}
                </div>
              )}
              {pastGroups.length > 0 && (
                <div className="space-y-5">
                  <p className="text-[12px] font-bold text-muted-foreground -mb-2">지난 공연</p>
                  {pastGroups.map(([date, list]) => (
                    <EventDateGroup key={date} date={date} list={list} />
                  ))}
                </div>
              )}
            </>
          )}

          <Link
            href="/events"
            className="block text-center bg-[#1C1C1E] rounded-2xl p-3 text-[13px] font-bold text-foreground hover:bg-[#232326] transition-colors"
          >
            전체 공연 일정 보기
          </Link>
        </div>
      </div>
    </>
  );
}
