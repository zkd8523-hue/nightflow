import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Instagram, MapPin, ExternalLink, Ticket } from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { eventSlug } from "@/lib/events/slug";
import { splitLineupDate } from "@/lib/lineups/formatDate";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import type { Metadata } from "next";

// 없는 slug는 notFound() — force-dynamic 필수. 없으면 Soft 404가 되어 색인이
// 오염된다(/dj/[slug]·클럽 상세와 동일 이유).
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface PerformerRef {
  raw_name: string;
  sort_order: number;
  artists: { display_name: string; slug: string | null } | { display_name: string; slug: string | null }[] | null;
}

interface EventRow {
  id: string;
  event_date: string;
  title: string | null;
  lineup: string[] | null;
  ticket_url: string | null;
  source_url: string | null;
  performers: { name: string; slug: string | null }[];
}

/** KST 오늘 (events/[date] 와 같은 규약) */
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function fetchVenue(slug: string) {
  const supabase = await createClient();

  const vq = supabase
    .from("venues")
    .select("id, name, slug, instagram, area, address, latitude, longitude, description, venue_type")
    .eq("slug", slug)
    .is("deleted_at", null);
  if (!SHOW_TEST_DATA) vq.eq("is_test", false);
  const { data: venue } = await vq.maybeSingle();
  if (!venue) return null;

  const { data: eventsRaw } = await supabase
    .from("club_events")
    .select(
      `id, event_date, title, lineup, ticket_url, source_url,
       club_event_performers(raw_name, sort_order, artists(display_name, slug))`
    )
    .eq("venue_id", venue.id)
    .eq("status", "approved")
    .order("event_date", { ascending: false })
    .limit(60)
    .returns<(Omit<EventRow, "performers"> & { club_event_performers: PerformerRef[] | null })[]>();

  const events: EventRow[] = (eventsRaw ?? []).map((e) => {
    const performers = (e.club_event_performers ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => {
        const a = Array.isArray(p.artists) ? (p.artists[0] ?? null) : p.artists;
        return { name: a?.display_name ?? p.raw_name, slug: a?.slug ?? null };
      });
    const { club_event_performers: _drop, ...rest } = e;
    return { ...rest, performers };
  });

  const today = todayKST();
  const all = events;
  // 예정은 가까운 날짜부터, 지난 공연은 최신부터 — 사람이 보는 순서가 반대다.
  const upcoming = all.filter((e) => e.event_date >= today).reverse();
  const past = all.filter((e) => e.event_date < today).slice(0, 30);

  return { venue, upcoming, past };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = await fetchVenue(slug);
  if (!found) return {};
  const { venue, upcoming, past } = found;

  const area = venue.area ? ` ${venue.area}` : "";
  const title = `${venue.name}${area} 공연 일정 - 라인업·예매`;
  const next = upcoming[0];
  const names = [...upcoming, ...past]
    .flatMap((e) => e.lineup ?? [])
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");
  const description =
    `${venue.name}${area} 공연장 일정.` +
    (next ? ` 다음 공연: ${next.title ?? ""} (${next.event_date}).` : "") +
    (names ? ` 출연: ${names}.` : "") +
    " 나플에서 공연 라인업과 예매 정보를 확인하세요.";
  const url = `https://nightflow.kr/venues/${venue.slug}`;

  return {
    title,
    description,
    keywords: [
      venue.name,
      `${venue.name} 공연`,
      `${venue.name} 공연 일정`,
      ...(venue.area ? [`${venue.area} 공연`, `${venue.area} 공연장`] : []),
    ],
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

export default async function VenuePage({ params }: PageProps) {
  const { slug } = await params;
  const found = await fetchVenue(slug);
  if (!found) notFound();
  const { venue, upcoming, past } = found;

  const igHandle = venue.instagram?.replace(/^@/, "") || null;
  const next = upcoming[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicVenue",
    name: venue.name,
    url: `https://nightflow.kr/venues/${venue.slug}`,
    ...(venue.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: venue.address,
            addressLocality: venue.area ?? undefined,
            addressCountry: "KR",
          },
        }
      : {}),
    ...(venue.latitude && venue.longitude
      ? { geo: { "@type": "GeoCoordinates", latitude: venue.latitude, longitude: venue.longitude } }
      : {}),
    ...(igHandle ? { sameAs: [`https://instagram.com/${igHandle}`] } : {}),
    event: upcoming.map((e) => ({
      "@type": "MusicEvent",
      name: e.title ?? "공연",
      startDate: e.event_date,
      url: e.title
        ? `https://nightflow.kr/events/${e.event_date}/${encodeURIComponent(eventSlug(e.title))}`
        : undefined,
      location: { "@type": "MusicVenue", name: venue.name },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="min-h-screen bg-[#0A0A0A] pb-24">
        <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
          {/* 진입 경로가 공연 상세만이 아니다(검색 유입 포함) — 히스토리 우선, 외부 유입은 /events 폴백 */}
          <BackButton fallbackHref="/events" />

          {/* 신원 — 사진·소개가 없는 곳이 대부분이라 이름·지역·핸들만 한 덩이로 묶는다.
              없는 항목은 아예 그리지 않는다(빈 "등록되지 않음" 줄을 만들지 않기 위함). */}
          <div>
            <h1 className="text-2xl font-black text-foreground leading-tight">{venue.name}</h1>
            <p className="text-[13px] text-muted-foreground mt-1.5">
              {venue.area && <span>{venue.area}</span>}
              {venue.area && igHandle && <span className="mx-1.5">·</span>}
              {igHandle && (
                <a
                  href={`https://instagram.com/${igHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#ff7ab5] hover:text-[#ff2f92] transition-colors"
                >
                  @{igHandle}
                </a>
              )}
            </p>
          </div>

          {venue.description && (
            <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
              {venue.description}
            </p>
          )}

          {/* 주소 — 14곳 중 6곳만 확보됐다(카카오 로컬 자동조회는 동명 업소 오매칭이 많아
              카테고리·지역이 둘 다 맞는 것만 채웠다). 없으면 이 카드 자체가 안 나온다. */}
          {venue.address && (
            <a
              href={`https://map.kakao.com/link/search/${encodeURIComponent(venue.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-[#1C1C1E] rounded-2xl p-3 hover:bg-[#232326] transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-[13px] text-foreground truncate">{venue.address}</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            </a>
          )}

          {/* 다음 공연 LED — 있을 때만. 앱 공통 전광판 언어(공연 축은 핑크 라벨) */}
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
                  NEXT LIVE
                </p>
                <p
                  className="text-center font-mono text-[14px] font-bold mt-1 px-3 truncate text-[#39ff6a]"
                  style={{ textShadow: "0 0 2px rgba(57,255,106,0.9), 0 0 9px rgba(57,255,106,0.55)" }}
                >
                  {splitLineupDate(next.event_date).label} · {next.title ?? "공연"}
                </p>
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <EventSection title="예정 공연" events={upcoming} />
          )}

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

/** 공연 목록 한 덩이 — 날짜 칩 + 제목 + 라인업. 제목이 있어야 상세 slug가 나오므로
 *  제목 없는 행은 링크 없이 텍스트로만 둔다. */
function EventSection({ title, events }: { title: string; events: EventRow[] }) {
  return (
    <div>
      <h2 className="text-[15px] font-black text-foreground mb-2.5">
        {title} <span className="text-[12px] font-normal text-muted-foreground">{events.length}</span>
      </h2>
      <div className="bg-[#1C1C1E] rounded-2xl px-3.5">
        {events.map((e) => {
          const { label, dow } = splitLineupDate(e.event_date);
          const [, m, d] = e.event_date.split("-");
          const slug = e.title ? eventSlug(e.title) : "";
          const href = slug ? `/events/${e.event_date}/${encodeURIComponent(slug)}` : null;
          const performers = e.performers.length > 0 ? e.performers : (e.lineup ?? []).filter(Boolean).map((n) => ({ name: n, slug: null }));

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
                {performers.length > 0 && (
                  <p className="text-[11.5px] text-neutral-400 mt-0.5 line-clamp-2">
                    {performers.map((p, i) => (
                      <span key={`${p.slug ?? p.name}-${i}`}>
                        {i > 0 && ", "}
                        {p.slug ? (
                          <Link
                            href={`/artists/${p.slug}`}
                            onClick={(ev) => ev.stopPropagation()}
                            className="relative z-10 text-[#8ec5ff] hover:text-[#8ec5ff]/80"
                          >
                            {p.name}
                          </Link>
                        ) : (
                          p.name
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

          // href가 있어도 body 안에 아티스트 링크(<a>)가 중첩될 수 있어(라인업 클릭
          // 시 상세로 끌려가면 안 됨) body를 Link로 감싸지 않는다. 대신 투명 링크를
          // 카드 위에 깔고(absolute inset-0) 안쪽 링크만 z-10으로 올린다
          // (UndergroundEventList의 stretched-link 패턴과 동일).
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
