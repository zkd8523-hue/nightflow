import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Disc3, ChevronRight, ExternalLink, Ticket } from "lucide-react";
import { LineupSetTable } from "@/components/lineups/LineupSetTable";
import { getBusinessDateISO } from "@/lib/lineups/time";
import { formatLineupDate } from "@/lib/lineups/formatDate";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import { BackButton } from "@/components/ui/BackButton";
import { LineupShareButton } from "@/components/lineups/LineupShareButton";
import type { Metadata } from "next";

// 날짜별 라인업 아카이브 — SEO 본진("클럽명 8월 30일 라인업" 류 쿼리는 이 URL이 아니면
// 못 잡는다, 클럽 상세는 "오늘"만 보여주므로)이면서, 운영자가 며칠 전 미리 올려둔
// 라인업을 게시 당일 전에 확인하는 미리보기 용도로도 쓴다.
//
// 없는 날짜는 notFound() — force-dynamic 필수(없으면 Soft 404가 되어 SEO에 역효과,
// 클럽 상세 페이지와 동일한 이유).
export const dynamic = "force-dynamic";


interface PageProps {
  params: Promise<{ id: string; date: string }>;
}

interface DjRef {
  id: string;
  slug: string;
  display_name: string;
  instagram: string | null;
}

interface LineupRow {
  event_title: string | null;
  ticket_url: string | null;
  source: string;
  lineup_sets: Array<{
    start_min: number | null;
    end_min: number | null;
    sort_order: number;
    // PostgREST가 조인을 배열/단일 객체 양쪽으로 돌려줄 수 있다 — 아래에서 정규화한다
    djs: DjRef | DjRef[] | null;
  }>;
}

async function fetchLineup(clubId: string, date: string) {
  const supabase = await createClient();

  const clubQuery = supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url")
    .eq("id", clubId)
    .is("deleted_at", null);
  if (!SHOW_TEST_DATA) clubQuery.eq("status", "approved");
  const { data: club } = await clubQuery.single();
  if (!club) return null;

  const { data: lineup } = await supabase
    .from("club_lineups")
    .select("event_title, ticket_url, source, lineup_sets(start_min, end_min, sort_order, djs(id, slug, display_name, instagram))")
    .eq("club_id", clubId)
    .eq("event_date", date)
    .maybeSingle<LineupRow>();

  // 날짜 칩용 — 이 클럽의 예정된 다른 날짜들. 오늘 영업일 이후만(지난 라인업은 칩에 안 보임).
  const { data: otherDates } = await supabase
    .from("club_lineups")
    .select("event_date")
    .eq("club_id", clubId)
    .gte("event_date", getBusinessDateISO())
    .order("event_date", { ascending: true })
    .limit(20);

  return { club, lineup, otherDates: (otherDates ?? []).map((r) => r.event_date as string) };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, date } = await params;
  const result = await fetchLineup(id, date);
  if (!result?.club) return {};

  const [y, m, d] = date.split("-");
  const title = `${result.club.name} ${parseInt(m, 10)}월 ${parseInt(d, 10)}일 라인업 - DJ 타임테이블`;
  const description = `${result.club.name}(${result.club.area ?? ""}) ${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일 DJ 타임테이블. 나플에서 시간대별 라인업을 확인하세요.`;
  const url = `https://nightflow.kr/clubs/${id}/lineup/${date}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    // 공유했을 때 카톡 등에서 미리보기 카드가 뜨도록 — 이 페이지엔 그동안 빠져 있었다
    // (events/[date]/[slug] 등 다른 라인업 라우트엔 전부 있던 블록).
    openGraph: {
      title,
      description,
      url,
      type: "website",
      // 클럽 대표 사진이 있으면 그걸 카톡 공유 카드 이미지로 — 없으면 나플 공통
      // 이미지로 폴백.
      images: result.club.thumbnail_url
        ? [{ url: result.club.thumbnail_url }]
        : [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

export default async function ClubLineupDatePage({ params }: PageProps) {
  const { id, date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const result = await fetchLineup(id, date);
  if (!result) notFound();
  const { club, lineup, otherDates } = result;

  const rawSets = (lineup?.lineup_sets ?? []) as LineupRow["lineup_sets"];
  const sets = rawSets
    .map((s) => ({
      start_min: s.start_min,
      end_min: s.end_min,
      sort_order: s.sort_order,
      dj: Array.isArray(s.djs) ? s.djs[0] ?? null : s.djs,
    }))
    .sort((a, b) =>
      a.start_min !== null && b.start_min !== null
        ? a.start_min - b.start_min
        : a.sort_order - b.sort_order
    );

  if (!lineup || sets.length === 0) notFound();

  const [, m, d] = date.split("-");
  const dateLabel = `${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: lineup.event_title ? `${club.name} ${lineup.event_title}` : `${club.name} ${dateLabel} 라인업`,
    startDate: date,
    location: {
      "@type": "Place",
      name: club.name,
      address: club.area ?? undefined,
    },
    performer: sets
      .filter((s) => s.dj)
      .map((s) => ({ "@type": "Person", name: s.dj!.display_name })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="min-h-screen bg-[#0A0A0A] pb-24">
        <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
          {/* 진입 경로가 클럽 상세만이 아니다 — /lineups(전국 라인업), 찜 목록, 검색에서도
              들어온다. 하드코딩 링크는 어디서 왔든 클럽 상세로 보내버리므로 히스토리를 쓴다.
              외부 유입(검색 결과 등)일 때만 클럽 상세로 폴백. */}
          <div className="flex items-center justify-between">
            <BackButton fallbackHref={`/clubs/${id}`} />
            <LineupShareButton
              clubId={id}
              clubName={club.name}
              eventDate={date}
              eventTitle={lineup.event_title}
              djNames={sets.filter((s) => s.dj).map((s) => s.dj!.display_name)}
            />
          </div>

          <div>
            <h1 className="text-xl font-black text-foreground">
              {club.name} {dateLabel} 라인업
            </h1>
            {/* 파티 이름 — 꺾쇠로 감싸 클럽 설명이 아니라 "그날의 이벤트 제목"임을
                드러낸다(한국어권에서 〈〉는 작품·행사명 표기). */}
            {lineup.event_title && (
              <p className="text-sm font-bold text-amber-400 mt-1">
                〈{lineup.event_title}〉
              </p>
            )}
          </div>

          {/* 예매 링크 — 캡션에 명시된 경우만(lineup.ticket_url). 없는 라인업이
              대다수라 조건부로만 나온다. */}
          {lineup.ticket_url && (
            <a
              href={lineup.ticket_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-amber-500 rounded-2xl p-3 hover:bg-amber-600 transition-colors"
            >
              <span className="w-11 h-11 rounded-xl bg-black/10 flex items-center justify-center flex-shrink-0">
                <Ticket className="w-5 h-5 text-black" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-black truncate">예매하기</p>
              </div>
              <ExternalLink className="w-4 h-4 text-black flex-shrink-0" aria-hidden="true" />
            </a>
          )}

          {/* 클럽 상세 진입 — 이 페이지는 타임테이블만 보여줘서 위치·가격·영업시간 같은
              클럽 정보가 전혀 없다. /lineups에서 바로 들어온 유저는 뒤로가기로도
              클럽 상세에 닿지 못하므로 명시적인 링크가 필요하다. */}
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
            {/* 클럽명은 H1에 이미 있으므로 여기서 반복하지 않는다 — 썸네일과 문구로
                어디로 가는 링크인지 충분히 전달된다. 지역은 H1에 없는 정보라 남긴다. */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate">
                클럽 정보 보기
              </p>
              <p className="text-[11px] text-muted-foreground">
                위치 · 영업시간 · 가격표
                {club.area ? ` · ${club.area}` : ""}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          </Link>

          {/* 날짜 칩 — 시트(UpcomingLineupSheet)와 같은 UI. 여기서는 서버 렌더 <Link>로
              날짜를 눌러 바로 다른 날짜 페이지로 이동한다(클라이언트 상태 불필요). */}
          {otherDates.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
              {otherDates.map((d) => (
                <Link
                  key={d}
                  href={`/clubs/${id}/lineup/${d}`}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                    d === date
                      ? "bg-amber-500 text-black"
                      : "bg-[#1C1C1E] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {formatLineupDate(d)}
                </Link>
              ))}
            </div>
          )}

          {/* 타임테이블은 클라이언트 컴포넌트 — NOW 하이라이트에 현재 시각이 필요하다 */}
          <LineupSetTable sets={sets} eventDate={date} />
        </div>
      </div>
    </>
  );
}
