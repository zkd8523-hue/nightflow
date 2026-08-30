import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createServerClient } from "@supabase/ssr";
import { eventSlug, isValidEventDate } from "@/lib/events/slug";
import { formatLineupDate } from "@/lib/lineups/formatDate";

// 날짜별 공연 목록 — /events/{date}/{slug}의 부모.
// 부모를 비워두면 크롤러가 경로를 타고 올라왔을 때 404를 맞는다
// (/clubs/[id]/lineup 이 page.tsx 없이 [date]만 있어서 실제로 그런 상태다).
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ date: string }>;
}

interface ClubRef {
  id: string;
  name: string;
  area: string | null;
  is_test: boolean;
  status: string;
  deleted_at: string | null;
}

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function normalizeVenueName(raw: string | null): string {
  const s = (raw ?? "").trim();
  if (!s || /^<.*>$/.test(s) || /^(unknown|미상|없음|n\/?a)$/i.test(s)) return "";
  return s;
}

type RawRow = {
  id: string;
  title: string | null;
  club_id: string | null;
  club_name_raw: string;
  venue_area: string | null;
  lineup: string[] | null;
  source_url: string | null;
  clubs: ClubRef | ClubRef[] | null;
};

async function fetchDay(date: string) {
  const supabase = createAnonClient();
  const { data } = await supabase
    .from("club_events")
    .select(
      `id, title, club_id, club_name_raw, venue_area, lineup, source_url,
       clubs(id, name, area, is_test, status, deleted_at)`
    )
    .eq("status", "approved")
    .eq("event_date", date)
    .limit(60);

  return ((data ?? []) as unknown as RawRow[])
    .filter((r) => {
      const c = firstOf(r.clubs);
      return !(c && (c.is_test || c.deleted_at || c.status !== "approved"));
    })
    .map((r) => {
      const c = firstOf(r.clubs);
      return {
        id: r.id,
        title: r.title ?? "",
        slug: eventSlug(r.title),
        venue: normalizeVenueName(r.club_name_raw) || c?.name || "(장소 미상)",
        area: c?.area ?? r.venue_area ?? "",
        lineup: r.lineup ?? [],
        source_url: r.source_url,
      };
    })
    .filter((r) => r.slug);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date } = await params;
  if (!isValidEventDate(date)) return {};
  const rows = await fetchDay(date);
  if (rows.length === 0) return {};

  const dateLabel = formatLineupDate(date);
  const areas = [...new Set(rows.map((r) => r.area).filter(Boolean))].slice(0, 4).join("·");
  const url = `https://nightflow.kr/events/${date}`;

  return {
    title: `${date.slice(0, 4)}년 ${dateLabel} 클럽 공연 ${rows.length}건`,
    description:
      `${dateLabel} 열리는 클럽 공연 ${rows.length}건.` +
      (areas ? ` ${areas} 지역.` : "") +
      ` ${rows.slice(0, 4).map((r) => r.title).filter(Boolean).join(", ")} 등. 나플.`,
    alternates: { canonical: url },
    openGraph: {
      title: `${dateLabel} 클럽 공연 ${rows.length}건`,
      description: `${dateLabel} 열리는 클럽 공연을 한눈에. 나플.`,
      url,
      type: "website",
      images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
    },
  };
}

export default async function EventsByDatePage({ params }: PageProps) {
  const { date } = await params;
  if (!isValidEventDate(date)) notFound();

  const rows = await fetchDay(date);
  if (rows.length === 0) notFound();

  const dateLabel = formatLineupDate(date);

  return (
    <div className="min-h-screen bg-background text-foreground pb-10">
      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Link href="/events" className="-ml-2 shrink-0 w-11 h-11 -my-2 flex items-center justify-center rounded-full hover:bg-muted hover:text-foreground transition-colors" aria-label="공연 목록으로">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <Link href="/events" className="hover:text-foreground">공연</Link>
        </nav>

        <div>
          <h1 className="text-[26px] font-black tracking-tight leading-tight">
            {date.slice(0, 4)}년 {dateLabel} 공연
          </h1>
          <p className="text-[14px] text-muted-foreground mt-1">{rows.length}건이 등록되어 있습니다.</p>
        </div>

        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/events/${date}/${encodeURIComponent(r.slug)}`}
                className="block rounded-2xl bg-card border border-border p-4 hover:border-brand-amber/50 transition-colors"
              >
                <p className="text-[16px] font-black leading-snug break-keep">{r.title}</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  {r.venue}{r.area && ` · ${r.area}`}
                </p>
                {r.lineup.length > 0 && (
                  <p className="text-[13px] mt-1.5 break-keep">{r.lineup.slice(0, 6).join(" · ")}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/events"
          className="flex items-center justify-between gap-3 rounded-2xl bg-card border border-border px-4 py-3.5 text-[14px] font-bold hover:text-brand-amber transition-colors"
        >
          <span>다른 날짜 공연 보기</span>
          <span className="text-muted-foreground" aria-hidden="true">›</span>
        </Link>
      </div>
    </div>
  );
}
