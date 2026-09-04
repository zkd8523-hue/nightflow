import type { Metadata } from "next";
import { createServerClient } from "@supabase/ssr";
import { getBusinessDateISO } from "@/lib/lineups/time";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import {
  NationwideLineupList,
  type LineupClubRow,
} from "@/components/lineups/NationwideLineupList";

// SEO가 이 화면의 존재 이유 중 하나다("오늘 홍대 DJ 라인업" 류 쿼리).
// 크롤러가 클럽명·DJ명을 HTML에서 봐야 하므로 서버 렌더 + 짧은 재검증.
export const revalidate = 300;

// "전국 DJ 라인업"은 검색 수요가 거의 없는 추상어다(실측: 네이버·구글 TOP 30
// 어디에도 없음). 실제 검색은 거의 전부 지역명이 붙는다("홍대 클럽"이 구글 노출
// 최대 3,527). 제목 앞에 상위 지역을 박아 그 자리를 노린다.
export const metadata: Metadata = {
  title: "홍대·강남·이태원 클럽 DJ 라인업 - 오늘 밤 타임테이블",
  description:
    "서울 홍대·강남·이태원부터 부산·대구까지 전국 클럽 DJ 타임테이블. 날짜별 라인업과 DJ 인스타그램을 한눈에.",
  alternates: { canonical: "https://nightflow.kr/lineups" },
  openGraph: {
    title: "홍대·강남·이태원 클럽 DJ 라인업 - 오늘 밤 타임테이블",
    description: "전국 클럽 DJ 타임테이블을 날짜별로 한눈에. 나플.",
    url: "https://nightflow.kr/lineups",
    type: "website",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
};

/** 쿠키 없는 익명 SSR 클라이언트 — 라인업 테이블은 RLS가 공개 SELECT다(559). */
function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

interface DjRef {
  id: string;
  slug: string;
  display_name: string;
  instagram: string | null;
  soundcloud_url: string | null;
  youtube_url: string | null;
  /** Migration 616 대분류 6종. 절반 정도는 비어 있다 — 없으면 태그를 안 그린다. */
  genre: string | null;
}

interface ClubRef {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  is_test: boolean;
  status: string;
  deleted_at: string | null;
  /** clubs.aliases (Migration 231) — 검색 전용. 운영자가 /admin/clubs/search-misses에서 늘린다. */
  aliases: string[] | null;
}

interface RawLineupRow {
  /** club_lineups.id — 날짜별 좋아요(lineup_likes)가 매달리는 키 (Migration 596) */
  id: string;
  event_date: string;
  club_id: string;
  door_open_min: number | null;
  event_title: string | null;
  // PostgREST는 조인을 배열/단일 객체 양쪽으로 돌려준다 — 아래에서 정규화
  clubs: ClubRef | ClubRef[] | null;
  lineup_sets: Array<{
    // 캡션에서 수집한 라인업은 시간이 없다(순서만) — Migration 573
    start_min: number | null;
    end_min: number | null;
    sort_order: number;
    djs: DjRef | DjRef[] | null;
  }>;
}

/** 조인이 배열로 오든 객체로 오든 하나로 만든다(클럽 상세와 동일 규약). */
function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function LineupsPage() {
  const supabase = createAnonClient();

  const { data } = await supabase
    .from("club_lineups")
    .select(
      `id, event_date, club_id, door_open_min, event_title,
       clubs(id, name, area, thumbnail_url, is_test, status, deleted_at, aliases),
       lineup_sets(start_min, end_min, sort_order, djs(id, slug, display_name, instagram, soundcloud_url, youtube_url, genre))`
    )
    .gte("event_date", getBusinessDateISO())
    .order("event_date", { ascending: true })
    .limit(200);

  const raw = (data ?? []) as unknown as RawLineupRow[];

  // DJ 별칭(dj_aliases)은 여기서 받지 않는다 — 검색 매칭에만 쓰이고 화면에는 안
  // 그려지는데, 위 쿼리 결과를 기다렸다 도는 순차 2단계가 되고 DJ id 수백 개를
  // URL에 나열하게 된다. 검색창을 열 때 클라이언트가 받는다(useDjAliases).

  const rows: LineupClubRow[] = [];
  for (const r of raw) {
    const club = firstOf(r.clubs);
    if (!club) continue;
    // club_lineups에는 is_test가 없다 — 반드시 clubs 조인으로 거른다(558 규약).
    if (!SHOW_TEST_DATA && club.is_test) continue;
    if (club.deleted_at) continue;
    if (club.status !== "approved") continue;

    // 중첩 select는 order가 보장되지 않으므로 여기서 정렬한다.
    const sets = (r.lineup_sets ?? [])
      .map((s) => {
        const dj = firstOf(s.djs);
        return {
          start_min: s.start_min,
          end_min: s.end_min,
          sort_order: s.sort_order,
          dj,
        };
      })
      // 시간이 있으면 시간순, 없으면 캡션에 적힌 순서(sort_order)
      .sort((a, b) => {
        if (a.start_min !== null && b.start_min !== null) return a.start_min - b.start_min;
        return a.sort_order - b.sort_order;
      });

    if (sets.length === 0) continue; // 셋 없는 껍데기 라인업은 목록에 안 낸다

    rows.push({
      id: r.id,
      event_date: r.event_date,
      club_id: club.id,
      club_name: club.name,
      club_area: club.area,
      club_aliases: club.aliases ?? [],
      club_thumbnail: club.thumbnail_url,
      door_open_min: r.door_open_min,
      event_title: r.event_title,
      sets,
    });
  }

  return <NationwideLineupList rows={rows} />;
}
