import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Instagram, Heart, Pencil } from "lucide-react";
import { SoundcloudIcon } from "@/components/icons/SoundcloudIcon";
import { GENRE_LABEL, type DjGenre } from "@/lib/djCup/fetchTasteReport";
import { BackButton } from "@/components/ui/BackButton";
import { DjLedShowList, type DjShowRow } from "@/components/djs/DjLedShowList";
import { DjFavoriteButton } from "@/components/djs/DjFavoriteButton";
import { DjUpdateLineupButton } from "@/components/djs/DjUpdateLineupButton";
import { getBusinessDateISO } from "@/lib/lineups/time";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import { clubDisplayAlias } from "@/lib/clubs/seoAliases";
import type { Metadata } from "next";

// 없는 slug는 notFound() — force-dynamic 필수. 없으면 Soft 404가 되어
// SEO 색인이 오염된다(클럽 상세·날짜별 라인업 페이지와 동일 이유).
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
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

interface RawSetRow {
  start_min: number | null;
  club_lineups:
    | { event_date: string; clubs: ClubRef | ClubRef[] }
    | { event_date: string; clubs: ClubRef | ClubRef[] }[]
    | null;
}

function isVisibleClub(c: ClubRef | null): c is ClubRef {
  if (!c || c.deleted_at) return false;
  if (!SHOW_TEST_DATA && (c.is_test || c.status !== "approved")) return false;
  return true;
}

/** DjShowRow[] 외에 클럽 원본(aliases 포함)도 같이 뽑는다 — SEO 설명·키워드에
 *  쓸 뿐 화면(DjLedShowList)엔 안 넘긴다. DjShowRow 타입은 그대로 둔다. */
function toRows(raw: RawSetRow[] | null): { rows: DjShowRow[]; clubs: ClubRef[] } {
  const rows: DjShowRow[] = [];
  const clubs: ClubRef[] = [];
  for (const r of raw ?? []) {
    const lineup = Array.isArray(r.club_lineups) ? r.club_lineups[0] : r.club_lineups;
    if (!lineup) continue;
    const club = Array.isArray(lineup.clubs) ? lineup.clubs[0] : lineup.clubs;
    if (!isVisibleClub(club)) continue;
    rows.push({
      club_id: club.id,
      club_name: club.name,
      club_area: club.area,
      club_thumbnail: club.thumbnail_url,
      event_date: lineup.event_date,
      start_min: r.start_min,
    });
    clubs.push(club);
  }
  return { rows, clubs };
}

async function fetchDj(slug: string) {
  const supabase = await createClient();

  const djQuery = supabase
    .from("djs")
    .select("id, display_name, slug, instagram, soundcloud_url, bio, photo_url, claimed_by_user_id, is_test, genre, genre_source")
    .eq("slug", slug)
    .is("deleted_at", null);
  if (!SHOW_TEST_DATA) djQuery.eq("is_test", false);
  const { data: dj } = await djQuery.maybeSingle();
  if (!dj) return null;

  const today = getBusinessDateISO();

  const [{ data: upcomingRaw }, { data: pastRaw }, { count: favoriteCount }, { data: auth }] = await Promise.all([
    supabase
      .from("lineup_sets")
      .select("start_min, club_lineups!inner(event_date, clubs!inner(id, name, area, thumbnail_url, is_test, status, deleted_at, aliases))")
      .eq("dj_id", dj.id)
      .gte("club_lineups.event_date", today)
      .limit(60),
    supabase
      .from("lineup_sets")
      .select("start_min, club_lineups!inner(event_date, clubs!inner(id, name, area, thumbnail_url, is_test, status, deleted_at, aliases))")
      .eq("dj_id", dj.id)
      .lt("club_lineups.event_date", today)
      .limit(60),
    supabase.from("user_favorite_djs").select("id", { count: "exact", head: true }).eq("dj_id", dj.id),
    supabase.auth.getUser(),
  ]);

  const upcomingParsed = toRows(upcomingRaw as unknown as RawSetRow[]);
  const upcoming = upcomingParsed.rows
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.start_min ?? 0) - (b.start_min ?? 0));

  // 최근 20건 — 78%가 라인업 1건뿐인 현재는 상한이 작동할 일이 없지만, 수집이
  // 쌓이면 필요해진다(예정만 보여주면 SEO 본문이 얇고, 예정 0건 DJ는 빈 페이지가 됨).
  const pastParsed = toRows(pastRaw as unknown as RawSetRow[]);
  const past = pastParsed.rows
    .sort((a, b) => b.event_date.localeCompare(a.event_date) || (b.start_min ?? 0) - (a.start_min ?? 0))
    .slice(0, 20);

  // 중복 제거한 소속 클럽 원본(aliases 포함) — generateMetadata에서 "볼레로(Bolero)"
  // 형태로 설명·키워드에 쓴다. DjShowRow는 club_name만 있어 이걸로는 별칭이 안 실렸다.
  const clubsSeenMap = new Map<string, ClubRef>();
  for (const c of [...upcomingParsed.clubs, ...pastParsed.clubs]) clubsSeenMap.set(c.id, c);

  return {
    dj,
    upcoming,
    past,
    clubsSeen: Array.from(clubsSeenMap.values()),
    favoriteCount: favoriteCount ?? 0,
    isOwner: dj.claimed_by_user_id === (auth.user?.id ?? null) && dj.claimed_by_user_id !== null,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await fetchDj(slug);
  if (!result) return {};
  const { dj, upcoming, past, clubsSeen } = result;
  const nextShow = upcoming[0];
  const name = dj.display_name;
  const title = `${name} 라인업 - DJ 공연 일정·타임테이블`;

  // 설명엔 실제로 뛰는 클럽 이름을 넣는다. "프로필과 지난 이력을 확인하세요" 같은
  // 빈 문장은 검색 결과에서 클릭할 이유를 못 준다(CTR 2%대 페이지들의 공통 증상).
  // 한글 별칭이 있으면 "볼레로(Bolero)" 형태로 — 등록명 단독보다 검색에 유리하다.
  const venueLabels = clubsSeen.slice(0, 3).map((c) => {
    const primary = clubDisplayAlias({ id: c.id, name: c.name, aliases: c.aliases });
    return primary ? `${primary}(${c.name})` : c.name;
  });
  const venueText = venueLabels.length > 0 ? ` ${venueLabels.join(", ")} 등에서 플레이.` : "";
  const nextShowClub = clubsSeen.find((c) => c.id === nextShow?.club_id);
  const nextShowPrimary = nextShowClub
    ? clubDisplayAlias({ id: nextShowClub.id, name: nextShowClub.name, aliases: nextShowClub.aliases })
    : null;
  const nextShowLabel = nextShow
    ? nextShowPrimary
      ? `${nextShowPrimary}(${nextShow.club_name})`
      : nextShow.club_name
    : null;
  const description = nextShow
    ? `${name} DJ 공연 일정. 다음 무대는 ${nextShowLabel} ${nextShow.event_date}입니다.${venueText} 라인업과 타임테이블을 나플에서 확인하세요.`
    : `${name} DJ 라인업 기록과 공연 이력.${venueText} 클럽별 타임테이블을 나플에서 확인하세요.`;

  const url = `https://nightflow.kr/dj/${slug}`;
  return {
    title,
    description,
    // 클럽명 단독은 인스타·플레이스에 밀리지만 "DJ명 + 라인업/공연"은 경쟁이 비어 있다.
    keywords: [
      name,
      `${name} 라인업`,
      `${name} DJ`,
      `${name} 공연`,
      `${name} 타임테이블`,
      ...clubsSeen.flatMap((c) => {
        const primary = clubDisplayAlias({ id: c.id, name: c.name, aliases: c.aliases });
        return primary
          ? [`${c.name} 라인업`, `${c.name} DJ`, `${primary} 라인업`, `${primary} DJ`]
          : [`${c.name} 라인업`, `${c.name} DJ`];
      }),
    ],
    alternates: { canonical: url },
    // canonical·openGraph는 클럽/라인업/공연 라우트엔 전부 있는데 DJ 페이지만 빠져 있었다.
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      images: dj.photo_url
        ? [{ url: dj.photo_url }]
        : [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
    },
  };
}

export default async function DjProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const result = await fetchDj(slug);
  if (!result) notFound();
  const { dj, upcoming, past, favoriteCount, isOwner } = result;

  const isVerified = !!dj.claimed_by_user_id;
  const igHandle = dj.instagram?.replace(/^@/, "") || null;
  const djGenreLabel = dj.genre ? (GENRE_LABEL[dj.genre as DjGenre] ?? null) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: dj.display_name,
    image: dj.photo_url ?? undefined,
    url: `https://nightflow.kr/dj/${dj.slug}`,
    sameAs: [
      igHandle ? `https://instagram.com/${igHandle}` : null,
      dj.soundcloud_url ?? null,
    ].filter(Boolean),
    performerIn: upcoming.map((s) => ({
      "@type": "Event",
      name: `${s.club_name} ${s.event_date}`,
      startDate: s.event_date,
      location: { "@type": "Place", name: s.club_name },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="min-h-screen bg-background text-foreground max-w-lg mx-auto pb-24">
        <div className="px-4 pt-3">
          <BackButton fallbackHref="/lineups" />
        </div>

        {/* 명함 카드 — /u 프로필과 동일 마크업. DJ만 다른 세계관이면 앱이 갈라진다 */}
        <div className="px-4 mt-2">
          <div className="bg-card border border-border rounded-3xl p-4">
            <div className="flex items-start gap-4 pt-1">
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="relative w-24 h-24 rounded-full overflow-hidden bg-muted shrink-0 ring-2 ring-border">
                  {dj.photo_url ? (
                    <Image src={dj.photo_url} alt={dj.display_name} fill sizes="96px" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-foreground/60 text-4xl font-black">
                      {dj.display_name.charAt(0)}
                    </div>
                  )}
                </div>
                {isVerified && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-blue-500 text-white text-[11px] font-black leading-none">
                    <BadgeCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
                    인증됨
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="min-w-0 text-xl font-black leading-tight break-words tracking-tight">
                    {dj.display_name}
                  </h1>
                  {isOwner && (
                    <Link
                      href={`/dj/${dj.slug}/edit`}
                      aria-label="프로필 편집"
                      className="shrink-0 w-7 h-7 rounded-full bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted grid place-items-center active:scale-95 transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Link>
                  )}
                  {/* 찜 개수만 보여주고 정작 찜할 방법이 없었다 — 라인업·시트와
                      같은 버튼을 여기에도 둔다(찜해두면 뜨는 날 알림). */}
                  <DjFavoriteButton djId={dj.id} djName={dj.display_name} />
                </div>
                {igHandle && (
                  <a
                    href={`https://instagram.com/${igHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-muted-foreground truncate hover:text-foreground/80 active:opacity-70 transition-colors block mt-0.5"
                  >
                    @{igHandle}
                  </a>
                )}
                {/* 장르 (Migration 616). 출처가 클럽 태그인 경우는 "그 클럽에
                    게스트로 한 번 갔을 뿐"일 수 있어 단정하지 않는다 — 사클
                    출처(본인이 트랙에 단 태그)일 때만 확정으로 쓰고, 클럽
                    추정은 물음표 없이 조용히 같은 칩으로 두되 title로 근거를 남긴다. */}
                {djGenreLabel && (
                  <p
                    title={
                      dj.genre_source === "soundcloud"
                        ? "사운드클라우드 업로드 트랙 기준"
                        : "플레이한 클럽 기준 추정"
                    }
                    className="text-[12px] font-bold text-muted-foreground mt-1"
                  >
                    #{djGenreLabel}
                  </p>
                )}
                {/* 팔로움 숫자 — 시드 없음(진짜 찜 개수만). 0이면 부풀린 숫자로 오해받지
                    않도록 아예 숨긴다. */}
                {favoriteCount > 0 && (
                  <p className="flex items-center gap-1 text-[12px] text-muted-foreground mt-1">
                    <Heart className="w-3 h-3 fill-current" />
                    {favoriteCount}
                  </p>
                )}
              </div>
            </div>

            {dj.bio && (
              <p className="mt-3 text-[13px] font-semibold leading-[1.45] whitespace-pre-wrap break-words text-foreground">
                {dj.bio}
              </p>
            )}

            {(igHandle || dj.soundcloud_url) && (
              <div className="mt-4 -mx-4 -mb-4">
                <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
                  {igHandle && (
                    <a
                      href={`https://instagram.com/${igHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 bg-card px-4 py-2.5 active:bg-muted transition-colors rounded-bl-3xl ${!dj.soundcloud_url ? "rounded-br-3xl" : ""}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-pink-500/15 flex items-center justify-center flex-shrink-0">
                        <Instagram className="w-4 h-4 text-pink-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-muted-foreground uppercase">인스타그램</p>
                        <p className="text-[13px] font-bold text-foreground truncate">@{igHandle}</p>
                      </div>
                    </a>
                  )}
                  {dj.soundcloud_url && (
                    <a
                      href={dj.soundcloud_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 bg-card px-4 py-2.5 active:bg-muted transition-colors rounded-br-3xl ${!igHandle ? "rounded-bl-3xl" : ""}`}
                    >
                      {/* 사클 브랜드 오렌지(#FF5500) 고정. tailwind orange-400(#fb923c)은
                          갈색 끼가 돌아 인스타(선명한 핑크) 옆에서 유독 탁해 보였다.
                          인스타 아이콘은 선(stroke)이라 가벼운데 이건 면(fill)이라
                          같은 채도로는 덩어리져 보이는 것도 이유. */}
                      <div className="w-7 h-7 rounded-full bg-[#FF5500]/15 flex items-center justify-center flex-shrink-0">
                        <SoundcloudIcon size={16} className="text-[#FF5500]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-muted-foreground uppercase">사운드클라우드</p>
                        <p className="text-[13px] font-bold text-foreground truncate">듣기</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 border-t border-border" />

        <div className="px-4 mt-6">
          <h2 className="text-[15px] font-black text-foreground mb-3">예정된 라인업</h2>
          <DjLedShowList rows={upcoming} emptyLabel="예정된 라인업이 없어요" />
        </div>

        <div className="px-4 mt-8 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-black text-foreground">지난 플레이</h2>
          </div>
          {/* 제보 링크는 목록 아래로 — 제목과 목록 사이에 끼면 콘텐츠를 밀어낸다 */}
          <DjLedShowList rows={past} emptyLabel="등록된 지난 플레이가 없어요" />
          <DjUpdateLineupButton isOwner={isOwner} />
        </div>

      </div>
    </>
  );
}
