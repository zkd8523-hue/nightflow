import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Instagram, Ticket } from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { eventSlug } from "@/lib/events/slug";
import { splitLineupDate } from "@/lib/lineups/formatDate";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import type { Metadata } from "next";

// 없는 slug는 notFound() — force-dynamic 필수. 없으면 Soft 404가 되어 색인이
// 오염된다(/dj/[slug]·/venues/[slug]와 동일 이유).
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface ClubRef {
  id: string;
  name: string;
  area: string | null;
  is_test: boolean;
  status: string;
  deleted_at: string | null;
}

interface VenueRef {
  id: string;
  name: string;
  slug: string;
  area: string | null;
  is_test: boolean;
  deleted_at: string | null;
}

interface CoPerformer {
  raw_name: string;
  sort_order: number;
  artist_id: string;
  artists: { id: string; display_name: string; slug: string } | { id: string; display_name: string; slug: string }[] | null;
}

interface EventRawRow {
  id: string;
  event_date: string;
  title: string | null;
  club_name_raw: string;
  venue_area: string | null;
  ticket_url: string | null;
  clubs: ClubRef | ClubRef[] | null;
  venues: VenueRef | VenueRef[] | null;
  club_event_performers: CoPerformer[] | null;
}

interface EventRow {
  id: string;
  event_date: string;
  title: string | null;
  ticket_url: string | null;
  locationLabel: string;
  locationHref: string | null;
  withNames: { name: string; slug: string | null }[];
}

function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function hasHangul(s: string): boolean {
  return /[가-힣]/.test(s);
}

function hasLatin(s: string): boolean {
  return /[A-Za-z]/.test(s);
}

/** 표시명 + 별칭 중 한글·영문 표기를 하나씩 골라 병기한다. 검색어가 어느
 *  쪽이든(키드밀리 / Kid Milli) 제목·설명에 잡히게 하기 위함. */
function pickNames(displayName: string, aliases: string[]): { ko: string | null; en: string | null } {
  const all = Array.from(new Set([displayName, ...aliases].filter(Boolean)));
  const ko = all.find(hasHangul) ?? null;
  const en = all.find((s) => !hasHangul(s) && hasLatin(s)) ?? null;
  return { ko, en };
}

function combinedName(ko: string | null, en: string | null, fallback: string): string {
  if (ko && en && ko !== en) return `${ko} (${en})`;
  return ko ?? en ?? fallback;
}

/** KST 오늘 (events/[date]·venues/[slug]와 같은 규약) */
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function isVisibleClub(c: ClubRef | null): c is ClubRef {
  if (!c || c.deleted_at) return false;
  if (!SHOW_TEST_DATA && (c.is_test || c.status !== "approved")) return false;
  return true;
}

function isVisibleVenue(v: VenueRef | null): v is VenueRef {
  if (!v || v.deleted_at) return false;
  if (!SHOW_TEST_DATA && v.is_test) return false;
  return true;
}

async function fetchArtist(slug: string) {
  const supabase = await createClient();

  const aq = supabase
    .from("artists")
    .select("id, display_name, slug, instagram, bio, photo_url, is_test, deleted_at, artist_aliases(alias)")
    .eq("slug", slug)
    .is("deleted_at", null);
  if (!SHOW_TEST_DATA) aq.eq("is_test", false);
  const { data: artistRaw } = await aq.maybeSingle();
  if (!artistRaw) return null;

  const artist = {
    ...artistRaw,
    aliases: (artistRaw.artist_aliases ?? []).map((a: { alias: string }) => a.alias),
  };

  const { data: perfRows } = await supabase
    .from("club_event_performers")
    .select("event_id")
    .eq("artist_id", artist.id);
  const eventIds = Array.from(new Set((perfRows ?? []).map((r) => r.event_id)));

  if (eventIds.length === 0) {
    return { artist, upcoming: [] as EventRow[], past: [] as EventRow[] };
  }

  const { data: eventsRaw } = await supabase
    .from("club_events")
    .select(
      `id, event_date, title, club_name_raw, venue_area, ticket_url,
       clubs(id, name, area, is_test, status, deleted_at),
       venues(id, name, slug, area, is_test, deleted_at),
       club_event_performers(raw_name, sort_order, artist_id, artists(id, display_name, slug))`
    )
    .in("id", eventIds)
    .eq("status", "approved")
    .returns<EventRawRow[]>();

  const rows: EventRow[] = (eventsRaw ?? []).map((row) => {
    const club = firstOf(row.clubs);
    const venue = firstOf(row.venues);

    let locationLabel: string;
    let locationHref: string | null;
    if (isVisibleClub(club)) {
      locationLabel = club.area ? `${club.name} · ${club.area}` : club.name;
      locationHref = `/clubs/${club.id}`;
    } else if (isVisibleVenue(venue)) {
      locationLabel = venue.area ? `${venue.name} · ${venue.area}` : venue.name;
      locationHref = `/venues/${venue.slug}`;
    } else {
      locationLabel = row.venue_area ? `${row.club_name_raw} · ${row.venue_area}` : row.club_name_raw;
      locationHref = null;
    }

    const withNames = (row.club_event_performers ?? [])
      .filter((p) => p.artist_id !== artist.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => {
        const a = firstOf(p.artists);
        return { name: a?.display_name ?? p.raw_name, slug: a?.slug ?? null };
      });

    return {
      id: row.id,
      event_date: row.event_date,
      title: row.title,
      ticket_url: row.ticket_url,
      locationLabel,
      locationHref,
      withNames,
    };
  });

  const today = todayKST();
  const upcoming = rows.filter((r) => r.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const past = rows
    .filter((r) => r.event_date < today)
    .sort((a, b) => b.event_date.localeCompare(a.event_date))
    .slice(0, 20);

  return { artist, upcoming, past };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = await fetchArtist(slug);
  if (!found) return {};
  const { artist, upcoming, past } = found;

  const { ko, en } = pickNames(artist.display_name, artist.aliases);
  const name = combinedName(ko, en, artist.display_name);
  const title = `${name} 공연 일정 - 다음 공연·지난 공연`;

  const next = upcoming[0];
  const venues = Array.from(new Set([...upcoming, ...past].map((e) => e.locationLabel.split(" · ")[0]))).slice(0, 3);
  const venueText = venues.length > 0 ? ` ${venues.join(", ")} 등에서 무대에 섰다.` : "";
  const description = next
    ? `${name} 공연 일정. 다음 공연은 ${next.locationLabel} ${next.event_date}입니다.${venueText} 나플에서 확인하세요.`
    : `${name} 공연 기록.${venueText} 나플에서 라인업과 공연 일정을 확인하세요.`;

  const url = `https://nightflow.kr/artists/${slug}`;
  const keywordBases = [ko, en].filter((v): v is string => !!v);

  return {
    title,
    description,
    keywords: keywordBases.flatMap((n) => [n, `${n} 공연`, `${n} 공연 일정`, `${n} 라인업`]),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      images: artist.photo_url
        ? [{ url: artist.photo_url }]
        : [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

export default async function ArtistPage({ params }: PageProps) {
  const { slug } = await params;
  const found = await fetchArtist(slug);
  if (!found) notFound();
  const { artist, upcoming, past } = found;

  const { ko, en } = pickNames(artist.display_name, artist.aliases);
  const name = combinedName(ko, en, artist.display_name);
  const igHandle = artist.instagram?.replace(/^@/, "") || null;
  const next = upcoming[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    image: artist.photo_url ?? undefined,
    url: `https://nightflow.kr/artists/${artist.slug}`,
    sameAs: igHandle ? [`https://instagram.com/${igHandle}`] : undefined,
    performerIn: upcoming.map((e) => ({
      "@type": "MusicEvent",
      name: e.title ?? "공연",
      startDate: e.event_date,
      url: e.title
        ? `https://nightflow.kr/events/${e.event_date}/${encodeURIComponent(eventSlug(e.title))}`
        : undefined,
      location: { "@type": "Place", name: e.locationLabel },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="min-h-screen bg-[#0A0A0A] pb-24">
        <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
          <BackButton fallbackHref="/events" />

          <div>
            <h1 className="text-2xl font-black text-foreground leading-tight">{name} 공연 일정</h1>
            {igHandle && (
              <a
                href={`https://instagram.com/${igHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13px] text-[#ff7ab5] hover:text-[#ff2f92] transition-colors mt-1.5"
              >
                <Instagram className="w-3.5 h-3.5" aria-hidden="true" />@{igHandle}
              </a>
            )}
          </div>

          {next && (
            <div
              className="relative overflow-hidden rounded-lg shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_6px_18px_rgba(0,0,0,0.45)]"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1.3px)",
                backgroundSize: "6px 6px",
                backgroundColor: "#000",
              }}
            >
              <span
                className="absolute inset-0 pointer-events-none opacity-50"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(180deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, transparent 1px, transparent 3px)",
                }}
                aria-hidden="true"
              />
              <div className="relative z-[1] py-1.5">
                <p
                  className="text-center font-mono text-[9px] font-bold tracking-[0.18em] text-[#ff2f92]"
                  style={{ textShadow: "0 0 3px rgba(255,47,146,0.9), 0 0 10px rgba(255,47,146,0.6)" }}
                >
                  NEXT SHOW
                </p>
                <p
                  className="text-center font-mono text-[14px] font-bold mt-1 px-3 truncate text-[#39ff6a]"
                  style={{ textShadow: "0 0 2px rgba(57,255,106,0.9), 0 0 9px rgba(57,255,106,0.55)" }}
                >
                  {splitLineupDate(next.event_date).label} · {next.locationLabel}
                </p>
              </div>
            </div>
          )}

          {upcoming.length > 0 && <EventSection title="예정 공연" events={upcoming} />}

          {past.length > 0 && <EventSection title="지난 공연" events={past} />}

          {upcoming.length === 0 && past.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border py-10 text-center">
              <p className="text-[13px] text-muted-foreground">등록된 공연이 없어요</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** 공연 목록 한 덩이 — 날짜 칩 + 제목 + 장소 링크 + 함께 선 아티스트.
 *  venues/[slug]의 EventSection과 같은 구조(제목 없으면 상세 링크 없음). */
function EventSection({ title, events }: { title: string; events: EventRow[] }) {
  return (
    <div>
      <h2 className="text-[15px] font-black text-foreground mb-2.5">
        {title} <span className="text-[12px] font-normal text-muted-foreground">{events.length}</span>
      </h2>
      <div className="bg-[#1C1C1E] rounded-2xl px-3.5">
        {events.map((e) => {
          const { dow } = splitLineupDate(e.event_date);
          const [, m, d] = e.event_date.split("-");
          const slug = e.title ? eventSlug(e.title) : "";
          const href = slug ? `/events/${e.event_date}/${encodeURIComponent(slug)}` : null;

          const body = (
            <div className="flex gap-3 py-3 border-b border-white/[0.06] last:border-0">
              <div className="w-11 flex-shrink-0 text-center">
                <p className="font-mono text-[10px] text-muted-foreground">{parseInt(m, 10)}월</p>
                <p className="font-mono text-[19px] font-black leading-none text-foreground">{d}</p>
                <p className="text-[9.5px] text-muted-foreground">{dow}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-foreground leading-snug line-clamp-2">
                  {e.title ?? "(제목 없음)"}
                </p>
                {e.locationHref ? (
                  <Link
                    href={e.locationHref}
                    onClick={(ev) => ev.stopPropagation()}
                    className="relative z-10 inline-block text-[11.5px] text-[#39ff6a] hover:text-[#39ff6a]/80 mt-0.5"
                  >
                    {e.locationLabel}
                  </Link>
                ) : (
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">{e.locationLabel}</p>
                )}
                {e.withNames.length > 0 && (
                  <p className="text-[11.5px] text-neutral-400 mt-0.5 line-clamp-2">
                    with{" "}
                    {e.withNames.map((w, i) => (
                      <span key={`${w.slug ?? w.name}-${i}`}>
                        {i > 0 && ", "}
                        {w.slug ? (
                          <Link
                            href={`/artists/${w.slug}`}
                            onClick={(ev) => ev.stopPropagation()}
                            className="relative z-10 text-[#8ec5ff] hover:text-[#8ec5ff]/80"
                          >
                            {w.name}
                          </Link>
                        ) : (
                          w.name
                        )}
                      </span>
                    ))}
                  </p>
                )}
                {e.ticket_url && (
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-brand-amber">
                    <Ticket className="w-2.5 h-2.5" aria-hidden="true" />
                    예매 링크
                  </span>
                )}
              </div>
            </div>
          );

          // body 안에 장소·공연자 링크(<a>)가 있어 href를 body 전체에 씌우면
          // <a> 중첩이 된다. 투명 링크를 카드 위에 깔고 안쪽 링크만 z-10으로
          // 올린다(venues/[slug]·UndergroundEventList와 동일 패턴).
          return (
            <div key={e.id} className="relative -mx-1 px-1 rounded hover:bg-white/[0.03] transition-colors">
              {href && (
                <Link href={href} className="absolute inset-0 z-0" aria-label={`${e.title} 상세 보기`} />
              )}
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
