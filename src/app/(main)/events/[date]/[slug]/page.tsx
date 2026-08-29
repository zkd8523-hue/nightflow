import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Instagram, ExternalLink, ChevronLeft, ChevronRight, MapPin, Clock, Disc3 } from "lucide-react";
import { createServerClient } from "@supabase/ssr";
import { eventSlug, normalizeSlugParam, isValidEventDate } from "@/lib/events/slug";
import { formatLineupDate } from "@/lib/lineups/formatDate";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import { getTagsByGroup, type ClubTagGroup } from "@/lib/clubs/tags";
import { EventShareButton } from "@/components/events/EventShareButton";
import { LineupLikeButton } from "@/components/lineups/LineupLikeButton";
import { EventCommentSection } from "@/components/events/EventCommentSection";
import { ArtistNameWithHeart } from "@/components/artists/ArtistNameWithHeart";

// 공연 상세 — "SENSI SOUND", "팔로알토 공연" 류 고유명사 검색의 착지점.
// 없는 조합은 notFound() → force-dynamic 필수. 없으면 Suspense 경계가 200을 먼저
// 흘려보내 Soft 404가 된다(2026-08 /clubs 사고와 같은 원인).
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ date: string; slug: string }>;
}

interface ArtistRef {
  id: string;
  display_name: string;
  instagram: string | null;
  /** 있으면 이름이 /artists/{slug}로 링크된다 */
  slug: string | null;
  // 래퍼는 한글/영문 표기가 둘 다 통용된다("팔로알토" vs "Paloalto").
  // 별칭을 metadata keywords에만 넣는다 — 본문에 나열하면 /clubs가 색인 거부됐던
  // 키워드 스터핑과 같은 문제가 된다.
  artist_aliases?: Array<{ alias: string }> | null;
}

interface ClubRef {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  thumbnail_url: string | null;
  /** 아래 셋은 공연장 미리보기용 — 클럽 상세와 같은 필드를 쓴다 */
  tags: string[] | null;
  operating_hours: string | null;
  instagram: string | null;
  is_test: boolean;
  status: string;
  deleted_at: string | null;
}

interface VenueRef {
  id: string;
  name: string;
  slug: string;
  area: string | null;
  address: string | null;
  is_test: boolean;
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

/** 파서 자리표시자(<UNKNOWN> 등)를 화면에서 지운다 — /events 목록과 같은 규약. */
function normalizeVenueName(raw: string | null): string {
  const s = (raw ?? "").trim();
  if (!s || /^<.*>$/.test(s) || /^(unknown|미상|없음|n\/?a)$/i.test(s)) return "";
  return s;
}

function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 날짜가 같은 공연을 전부 가져와 슬러그로 고른다.
 * (슬러그는 DB에 없으므로 SQL로 못 찾는다. 하루치는 많아야 십수 건이라 부담 없다.)
 */
async function fetchEvent(date: string, slugParam: string) {
  const supabase = createAnonClient();

  const { data } = await supabase
    .from("club_events")
    .select(
      `id, event_date, title, club_id, club_name_raw, venue_area, lineup, source_url, source_account, ticket_url,
       clubs(id, name, area, address, thumbnail_url, tags, operating_hours, instagram, is_test, status, deleted_at),
       venues(id, name, slug, area, address, is_test, deleted_at),
       club_event_performers(raw_name, sort_order, artists(id, display_name, instagram, slug, artist_aliases(alias)))`
    )
    .eq("status", "approved")
    .eq("event_date", date)
    .limit(60);

  type RawRow = {
    id: string;
    event_date: string;
    title: string | null;
    club_id: string | null;
    club_name_raw: string;
    venue_area: string | null;
    lineup: string[] | null;
    source_url: string | null;
    source_account: string | null;
    ticket_url: string | null;
    clubs: ClubRef | ClubRef[] | null;
    venues: VenueRef | VenueRef[] | null;
    club_event_performers: Array<{
      raw_name: string;
      sort_order: number;
      artists: ArtistRef | ArtistRef[] | null;
    }> | null;
  };

  const rows = (data ?? []) as unknown as RawRow[];
  const want = normalizeSlugParam(slugParam);
  const row = rows.find((r) => eventSlug(r.title) === want);
  if (!row) return null;

  const club = firstOf(row.clubs);
  // 테스트/삭제/미승인 클럽에 붙은 공연은 없는 것으로 친다.
  // club_id가 없는 공연(미등록 장소, 492건 중 283건)은 그대로 살린다.
  if (club && (club.is_test || club.deleted_at || club.status !== "approved")) return null;

  // 공연장(venues)은 클럽과 배타적이다 — 클럽이 없을 때만 본다.
  const venueRaw = firstOf(row.venues);
  const venueRow =
    venueRaw && !venueRaw.deleted_at && (SHOW_TEST_DATA || !venueRaw.is_test) ? venueRaw : null;

  const performers = (row.club_event_performers ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ raw_name: p.raw_name, artist: firstOf(p.artists) }));

  const linkedNames = new Set(performers.map((p) => p.raw_name));
  const extra = (row.lineup ?? []).filter((n) => n && !linkedNames.has(n));

  // 이 공연장의 다른 공연 수 — 카드에 "그 외 N개"로 적어 누를 이유를 만든다.
  // 이름·주소만 있는 카드는 눌러도 뭐가 나올지 몰라 아무도 안 누른다.
  let venueOtherCount = 0;
  if (venueRow) {
    const { count } = await supabase
      .from("club_events")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueRow.id)
      .eq("status", "approved")
      .neq("id", row.id);
    venueOtherCount = count ?? 0;
  }

  return { row, club: club ?? null, venueRow, venueOtherCount, performers, extra };
}

/**
 * 검색 키워드 — 아티스트는 표기가 갈린다("팔로알토" / "Paloalto" / "paloaltongue").
 * artist_aliases에 이미 양쪽이 들어 있으므로 keywords에 전부 싣는다.
 * 본문에는 대표 이름 하나만 쓴다 — 별칭 나열을 본문에 넣으면 /clubs가 색인 거부됐던
 * 키워드 스터핑이 된다(메타 keywords는 정상 범위).
 */
function buildKeywords(o: {
  title: string;
  venue: string;
  area: string;
  performers: Array<{ raw_name: string; artist: ArtistRef | null }>;
  extra: string[];
}): string[] {
  const names = new Set<string>();
  for (const p of o.performers.slice(0, 8)) {
    if (p.artist?.display_name) names.add(p.artist.display_name);
    if (p.raw_name) names.add(p.raw_name);
    for (const a of p.artist?.artist_aliases ?? []) if (a.alias) names.add(a.alias);
  }
  for (const n of o.extra.slice(0, 6)) names.add(n);

  return [
    o.title,
    `${o.title} 공연`,
    o.venue && `${o.venue} 공연`,
    o.area && `${o.area} 공연`,
    o.area && `${o.area} 클럽 공연`,
    ...[...names].flatMap((n) => [n, `${n} 공연`]),
  ].filter(Boolean) as string[];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date, slug } = await params;
  if (!isValidEventDate(date)) return {};

  const found = await fetchEvent(date, slug);
  if (!found) return {};

  const { row, club, performers, extra } = found;
  const title = row.title ?? "공연";
  const venue = normalizeVenueName(row.club_name_raw) || club?.name || "";
  const area = club?.area ?? row.venue_area ?? "";
  const dateLabel = formatLineupDate(date);
  const names = [...performers.map((p) => p.artist?.display_name ?? p.raw_name), ...extra]
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");

  const head = [title, venue, area].filter(Boolean).join(" ");
  const url = `https://nightflow.kr/events/${date}/${encodeURIComponent(slug)}`;

  return {
    title: `${title} - ${venue}${area ? ` ${area}` : ""} ${dateLabel} 공연`,
    description:
      `${head} ${dateLabel} 공연 정보.` +
      (names ? ` 라인업: ${names}.` : "") +
      " 나플에서 날짜·장소·라인업을 확인하세요.",
    keywords: buildKeywords({ title, venue, area, performers, extra }),
    alternates: { canonical: url },
    openGraph: {
      title: `${title} - ${venue} ${dateLabel}`,
      description: names ? `라인업: ${names}` : `${head} ${dateLabel} 공연`,
      url,
      type: "website",
      // 클럽 대표 사진이 있으면 그걸 카톡 공유 카드 이미지로 — 없으면 나플 공통
      // 이미지로 폴백.
      images: club?.thumbnail_url
        ? [{ url: club.thumbnail_url }]
        : [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { date, slug } = await params;
  if (!isValidEventDate(date)) notFound();

  const found = await fetchEvent(date, slug);
  if (!found) notFound();

  const { row, club, venueRow, venueOtherCount, performers, extra } = found;
  const title = row.title ?? "공연";
  const venue = normalizeVenueName(row.club_name_raw) || club?.name || "(장소 미상)";
  const area = club?.area ?? row.venue_area ?? "";
  const dateLabel = formatLineupDate(date);
  const year = date.slice(0, 4);
  const isPast = date < todayKST();
  const performerNames = [...performers.map((p) => p.artist?.display_name ?? p.raw_name), ...extra].filter(Boolean);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: title,
    startDate: date,
    // 476/492건이 지난 공연이라 상태를 반드시 명시한다.
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: `https://nightflow.kr/events/${date}/${encodeURIComponent(slug)}`,
    location: {
      "@type": "Place",
      name: venue,
      ...(club?.address
        ? { address: { "@type": "PostalAddress", streetAddress: club.address, addressLocality: area, addressCountry: "KR" } }
        : area
          ? { address: { "@type": "PostalAddress", addressLocality: area, addressCountry: "KR" } }
          : {}),
    },
    performer: [
      ...performers.map((p) => ({ "@type": "MusicGroup", name: p.artist?.display_name ?? p.raw_name })),
      ...extra.map((n) => ({ "@type": "MusicGroup", name: n })),
    ],
    ...(club?.thumbnail_url ? { image: club.thumbnail_url } : {}),
    ...(row.ticket_url ? { offers: { "@type": "Offer", url: row.ticket_url, availability: "https://schema.org/InStock" } } : {}),
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-28 pb-safe">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* 상단 — 공연 하나만 보고 나가지 않게 목록으로 돌아갈 문을 항상 둔다 */}
      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* 뒤로가기는 브레드크럼 맨 앞 ‹ 하나로 충분하다 —
            전역 헤더가 이미 위에 있어서 sticky 바를 하나 더 얹으면 두 줄이 겹쳐 보인다.
            히트영역은 44px(모바일 최소 터치 크기) — 아이콘은 20px이라 -my-2로 줄 높이는 유지. */}
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground flex-wrap">
          <Link
            href="/events"
            className="-ml-2 shrink-0 w-11 h-11 -my-2 flex items-center justify-center rounded-full hover:bg-muted hover:text-foreground transition-colors"
            aria-label="공연 목록으로"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <Link href="/events" className="hover:text-foreground">공연</Link>
          {area && (
            <>
              <span>›</span>
              <Link href={`/events?area=${encodeURIComponent(area)}`} className="hover:text-foreground">{area}</Link>
            </>
          )}
          <span>›</span>
          <span className="text-foreground font-bold">{venue}</span>
          <EventShareButton
            eventDate={date}
            slug={slug}
            title={title}
            venue={venue}
            area={area}
            performerNames={performerNames}
          />
        </nav>

        {/* 날짜는 제목 위 눈썹(eyebrow)이다 — 캡슐로 감싸면 누를 수 있는 것처럼 보이는데
            실제로는 아무 동작도 없다. 아래 "일시" 줄과도 중복이라 최소한으로 둔다. */}
        <p className={`text-[12px] font-bold ${isPast ? "text-muted-foreground" : "text-foreground"}`}>
          {isPast ? `지난 공연 · ${year}. ${dateLabel}` : `${year}. ${dateLabel}`}
        </p>

        {/* 좋아요는 제목 옆(오른쪽 위). 아래로 내리면 한 줄을 통째로 먹어 붕 떠 보인다.
            제목이 길면 버튼 아래로 흘러 내려가도록 float를 쓴다 — flex로 나란히 두면
            버튼이 폭을 상시 점유해 짧은 제목까지 두 줄로 밀린다. */}
        <div>
          <div className="float-right ml-3 mb-1">
            <LineupLikeButton lineupId={row.id} target="event" />
          </div>
          <h1 className="text-[30px] font-black tracking-tight leading-tight break-keep">{title}</h1>
          <div className="clear-both" />
        </div>

        {/* 핵심 정보 — 제목 아래 부제는 두지 않는다(이 카드와 완전 중복이라) */}
        {/* "일시" 줄은 뒀다가 지웠다 — club_events엔 시간 컬럼이 없어서 결국
            제목 위 눈썹과 같은 날짜를 연도만 붙여 반복하는 줄이었다.
            연도는 눈썹으로 옮겼으므로 정보 손실은 없다. */}
        <dl className="rounded-2xl bg-card border border-border px-4">
          {/* 장소 줄 자체가 공연장 상세로 가는 링크다. 예전엔 아래에 "공연장 정보
              더보기" 카드를 따로 뒀는데, 같은 곳을 두 번 가리키면서 화면만 먹었다.
              등록된 공연장일 때만 링크 — 미등록 장소(전체의 절반)는 갈 데가 없다. */}
          <div className="py-3.5">
            <dt className="sr-only">장소</dt>
            <dd className="min-w-0">
              {club ? (
                <Link
                  href={`/clubs/${club.id}`}
                  aria-label={`${club.name} 공연장 정보 보기`}
                  className="block group"
                >
                  {/* 클럽 상세 헤더의 축약본 — 이름·지역·해시태그·주소·영업시간까지만
                      가져오고 LED 라이브 배너는 뺀다(그 정보가 곧 이 공연이라 중복). */}
                  <div className="flex items-center gap-3">
                    {club.thumbnail_url ? (
                      <Image
                        src={club.thumbnail_url}
                        alt=""
                        width={52}
                        height={52}
                        className="w-13 h-13 rounded-xl object-cover shrink-0"
                      />
                    ) : (
                      <span className="w-13 h-13 rounded-xl bg-muted flex items-center justify-center shrink-0">
                        <Disc3 className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black tracking-tight truncate group-hover:text-brand-amber transition-colors">
                          {venue}
                        </span>
                        {area && (
                          <span className="text-[13px] text-muted-foreground shrink-0">{area}</span>
                        )}
                      </span>
                    </span>
                    <ChevronRight
                      className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-brand-amber transition-colors"
                      aria-hidden="true"
                    />
                  </div>

                  {/* 태그는 DB에 "venue_type:club" 같은 코드로 저장된다 — 그대로 찍으면
                      #venue_type:club이 화면에 나온다. 클럽 상세(HashtagRow)와 같은
                      규칙으로 한글 라벨을 뽑고 순서도 타입 → 음악 → 흡연으로 맞춘다. */}
                  {(() => {
                    const ORDER: ClubTagGroup[] = ["venue_type", "genre", "smoking"];
                    const labels = ORDER.flatMap((g) =>
                      getTagsByGroup(club.tags ?? [], g).map((t) => t.shortLabel ?? t.label)
                    );
                    if (labels.length === 0) return null;
                    return (
                      <p className="flex flex-wrap gap-x-2 gap-y-0.5 mt-2.5 text-[12px] font-bold text-foreground">
                        {labels.map((label, i) => (
                          <span key={i}>#{label}</span>
                        ))}
                      </p>
                    );
                  })()}

                  {club.address && (
                    <p className="flex items-center gap-1.5 mt-2 text-[12px] text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{club.address}</span>
                    </p>
                  )}

                  {club.operating_hours && (
                    <p className="flex items-center gap-1.5 mt-1 text-[12px] text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{club.operating_hours}</span>
                    </p>
                  )}
                </Link>
              ) : venueRow ? (
                /* 공연장(venues)에서 열린 공연 — 클럽이 아니라 라이브홀이라 주대·영업시간
                   개념이 없다. 이름·지역·주소까지만 보여주고 공연장 상세로 보낸다. */
                <Link
                  href={`/venues/${venueRow.slug}`}
                  aria-label={`${venueRow.name} 공연장 정보 보기`}
                  className="block group"
                >
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black tracking-tight truncate group-hover:text-[#ff2f92] transition-colors">
                          {venueRow.name}
                        </span>
                        {(venueRow.area || area) && (
                          <span className="text-[13px] text-muted-foreground shrink-0">
                            {venueRow.area || area}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight
                      className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-[#ff2f92] transition-colors"
                      aria-hidden="true"
                    />
                  </div>

                  {venueRow.address && (
                    <p className="flex items-center gap-1.5 mt-2 text-[12px] text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{venueRow.address}</span>
                    </p>
                  )}

                  {/* 이름·주소만 있는 카드는 눌러도 뭐가 나올지 몰라 아무도 안 누른다.
                      "그 외 N개"로 여기 뭐가 더 있는지 먼저 알려준다. */}
                  {venueOtherCount > 0 && (
                    <p className="mt-2 text-[13px] font-bold text-[#ff7ab5] group-hover:text-[#ff2f92] transition-colors">
                      그 외 {venueOtherCount}개 공연 일정 보기 →
                    </p>
                  )}
                </Link>
              ) : (
                <span className="block text-2xl font-black tracking-tight truncate">
                  {venue}
                  {area && (
                    <span className="text-[13px] font-medium text-muted-foreground"> · {area}</span>
                  )}
                </span>
              )}
            </dd>
          </div>
        </dl>

        {(performers.length > 0 || extra.length > 0) && (
          <section>
            <h2 className="text-[17px] font-black mb-2">라인업</h2>
            <div className="rounded-2xl bg-card border border-border px-4 py-1">
              {performers.map((p, i) => {
                const nm = p.artist?.display_name ?? p.raw_name;
                const ig = p.artist?.instagram;
                const artistSlug = p.artist?.slug;
                return (
                  <div key={`${p.raw_name}-${i}`} className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0">
                    <ArtistNameWithHeart
                      artistId={p.artist?.id ?? null}
                      name={nm}
                      slug={artistSlug ?? null}
                    />
                    {ig && (
                      <a
                        href={`https://instagram.com/${ig}`}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="shrink-0 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-brand-amber transition-colors"
                        aria-label={`${nm} 인스타그램`}
                      >
                        <Instagram className="w-3.5 h-3.5" aria-hidden="true" />
                        @{ig}
                      </a>
                    )}
                  </div>
                );
              })}
              {extra.length > 0 && (
                <p className="text-[14px] leading-relaxed py-2.5 break-keep">
                  {extra.join(" · ")}
                </p>
              )}
            </div>
          </section>
        )}


        {/* 원문 캡션은 싣지 않는다 — 클럽·프로모터 저작물이고, 인스타와 중복 콘텐츠가 된다.
            사실 정보만 위에 재구성하고 원문은 링크로 보낸다. */}
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          {row.source_url && (
            <a
              href={row.source_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border text-[14px] font-bold hover:text-brand-amber transition-colors"
            >
              <span>원본 게시물 보기{row.source_account ? ` (${row.source_account})` : ""}</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            </a>
          )}
          <Link href="/events" className="flex items-center justify-between gap-3 px-4 py-3.5 text-[14px] font-bold hover:text-brand-amber transition-colors">
            <span>더 많은 공연 보기</span>
            <span className="text-muted-foreground" aria-hidden="true">›</span>
          </Link>
        </div>

        {/* 댓글 — 자유 댓글이 기본이고, 여기서 "같이 갈 사람" 채팅방을 만들어
            댓글로 올릴 수 있다 (Migration 598). 지난 공연은 읽기 전용. */}
        <EventCommentSection eventId={row.id} isPast={isPast} />
      </div>

      {/* 하단 CTA — 문의는 붙이지 않는다(외부 의존 + 파트너 미보장). 확실히
          존재하는 곳으로만 보낸다. 예매는 예외 — 캡션에 명시된 링크가 있을
          때만(row.ticket_url) 보여준다. 없는 공연은 기존처럼 클럽/더보기만. */}
      <div className="fixed bottom-0 inset-x-0 z-10 px-4 pt-3 pb-4 pb-safe bg-card/95 backdrop-blur-sm border-t border-border">
        <div className="w-full max-w-lg mx-auto space-y-2">
          {row.ticket_url && (
            <a
              href={row.ticket_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-3.5 rounded-2xl bg-amber-500 text-black font-black text-[15px]"
            >
              예매하기
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {club ? (
            <Link
              href={`/clubs/${club.id}`}
              className={
                row.ticket_url
                  ? "flex items-center justify-center w-full py-3 rounded-2xl bg-muted text-foreground font-bold text-[14px]"
                  : "flex items-center justify-center w-full py-3.5 rounded-2xl bg-inverse text-inverse-foreground font-black text-[15px]"
              }
            >
              {club.name} 클럽 정보 보기
            </Link>
          ) : (
            <Link
              href="/events"
              className={
                row.ticket_url
                  ? "flex items-center justify-center w-full py-3 rounded-2xl bg-muted text-foreground font-bold text-[14px]"
                  : "flex items-center justify-center w-full py-3.5 rounded-2xl bg-inverse text-inverse-foreground font-black text-[15px]"
              }
            >
              더 많은 공연 보기
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
