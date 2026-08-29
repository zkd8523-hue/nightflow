import type { Metadata } from "next";
import { createServerClient } from "@supabase/ssr";
import {
  UndergroundEventList,
  type UndergroundEventRow,
  type EventPerformer,
} from "@/components/events/UndergroundEventList";

// SEO가 이 화면의 존재 이유 중 하나다("이번주 홍대 힙합 공연" 류 쿼리).
// 크롤러가 공연명·아티스트명을 HTML에서 봐야 하므로 서버 렌더 + 짧은 재검증.
export const revalidate = 300;

// "언더그라운드 공연"도 마찬가지로 추상 카테고리어다(실측 0건). 실제로 검색되는
// 건 아티스트명·지역명(블랙넛·박재범·홍대 등)이라 제목에 상위 지역을 앞세운다.
export const metadata: Metadata = {
  title: "홍대·강남·이태원 클럽 공연 일정 - 힙합·라이브 라인업",
  description:
    "서울 홍대·강남·이태원부터 부산·대구까지 클럽 힙합 공연 일정. 래퍼 라인업과 아티스트 인스타그램을 한눈에.",
  alternates: { canonical: "https://nightflow.kr/events" },
  openGraph: {
    title: "홍대·강남·이태원 클럽 공연 일정 - 힙합·라이브 라인업",
    description: "전국 클럽 힙합 공연 일정을 날짜별로 한눈에. 나플.",
    url: "https://nightflow.kr/events",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

/** 쿠키 없는 익명 SSR 클라이언트 — club_events는 approved만 공개 SELECT(564). */
function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

/** KST 기준 오늘 — 지난 공연은 목록에 내지 않는다. */
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface ClubRef {
  id: string;
  name: string;
  thumbnail_url: string | null;
  is_test: boolean;
  status: string;
  deleted_at: string | null;
  /** clubs.aliases (Migration 231) — 검색 전용("제제"로 JEJE 공연을 찾게 한다). */
  aliases: string[] | null;
}

/** 조인이 배열/객체 양쪽으로 오는 PostgREST 특성 흡수(/lineups와 동일 규약). */
function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * 파서가 남긴 자리표시자를 걸러낸다.
 * 큐레이션 계정의 주간 모음 중 일부 항목은 캡션에 📍(장소) 줄이 아예 없어서
 * LLM이 `<UNKNOWN>`을 넣는다. 원본에 없는 정보라 채울 수 없으므로 화면에서만 숨긴다.
 */
function normalizeVenueName(raw: string | null): string {
  const s = (raw ?? "").trim();
  if (!s || /^<.*>$/.test(s) || /^(unknown|미상|없음|n\/?a)$/i.test(s)) return "";
  return s;
}

export default async function EventsPage() {
  const supabase = createAnonClient();

  const { data } = await supabase
    .from("club_events")
    .select(
      `id, event_date, title, club_id, club_name_raw, venue_area, lineup, source_url,
       clubs(id, name, thumbnail_url, is_test, status, deleted_at, aliases),
       club_event_performers(raw_name, sort_order, artists(id, display_name, instagram))`
    )
    .eq("status", "approved")
    .gte("event_date", todayKST())
    .order("event_date", { ascending: true })
    .limit(300);

  type RawRow = {
    id: string;
    event_date: string;
    title: string | null;
    club_id: string | null;
    club_name_raw: string;
    venue_area: string | null;
    lineup: string[] | null;
    source_url: string | null;
    clubs: ClubRef | ClubRef[] | null;
    club_event_performers: Array<{
      raw_name: string;
      sort_order: number;
      artists: EventPerformer | EventPerformer[] | null;
    }> | null;
  };

  const raw = (data ?? []) as unknown as RawRow[];

  // 아티스트 별칭 — 포스터 표기가 여러 개인 아티스트를 어느 표기로 검색해도 찾히게 한다.
  // 중첩 select(artists(artist_aliases(...)))가 아니라 별도 쿼리로 붙이는 건 /lineups의
  // dj_aliases와 같은 이유 — 2단계 중첩은 행이 불어나고 firstOf 정규화가 번거롭다.
  const artistIds = [
    ...new Set(
      raw.flatMap((r) =>
        (r.club_event_performers ?? [])
          .map((p) => firstOf(p.artists)?.id)
          .filter(Boolean) as string[]
      )
    ),
  ];
  const aliasesByArtist: Record<string, string[]> = {};
  if (artistIds.length > 0) {
    const { data: aliasRows } = await supabase
      .from("artist_aliases")
      .select("artist_id, alias")
      .in("artist_id", artistIds);
    for (const a of (aliasRows ?? []) as Array<{ artist_id: string; alias: string }>) {
      (aliasesByArtist[a.artist_id] ??= []).push(a.alias);
    }
  }

  const rows: UndergroundEventRow[] = [];
  for (const r of raw) {
    const club = firstOf(r.clubs);

    // 테스트/삭제/미승인 클럽에 붙은 공연은 감춘다. 단 club_id가 없는(미등록 장소)
    // 공연은 그대로 낸다 — 이 화면의 절반이 미등록 장소라 거르면 목록이 반토막 난다.
    if (club && (club.is_test || club.deleted_at || club.status !== "approved")) continue;

    const performers = (r.club_event_performers ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({ raw_name: p.raw_name, artist: firstOf(p.artists) }));

    const linked: EventPerformer[] = performers
      .map((p) => p.artist)
      .filter((a): a is EventPerformer => a !== null)
      .map((a) => ({ ...a, aliases: aliasesByArtist[a.id] ?? [] }));

    // lineup(TEXT[] 원문) 중 artists 조인에 못 붙은 이름 — 텍스트로라도 보여준다.
    // (재파싱 이전 데이터나 정규화 실패분이 여기 남는다)
    const linkedNames = new Set(performers.map((p) => p.raw_name));
    const extra = (r.lineup ?? []).filter((n) => n && !linkedNames.has(n));

    rows.push({
      id: r.id,
      event_date: r.event_date,
      title: r.title,
      club_id: club?.id ?? null,
      club_thumbnail: club?.thumbnail_url ?? null,
      // 표시 이름은 원문 우선 — 클럽 정식명("Bolero")보다 캡션 표기("볼레로 클럽")가
      // 포스터·인스타와 일치해서 사용자가 알아보기 쉽다.
      // 단 파서 표기(<UNKNOWN>)는 그대로 내보내지 않는다 — 캡션에 📍가 아예 없던
      // 항목이라 채울 값이 없고, 내부 토큰이 화면에 노출되면 버그로 보인다.
      venue_name: normalizeVenueName(r.club_name_raw) || club?.name || "(장소 미상)",
      // venue_name은 캡션 원문 우선이라 정식명이 빠질 수 있다("JEJE"만 있고 clubs.name 미반영).
      // 별칭 매칭은 club_id 기준이므로 정식명·별칭을 검색 전용으로 따로 싣는다(화면 미노출).
      club_name: club?.name ?? null,
      club_aliases: club?.aliases ?? [],
      venue_area: r.venue_area,
      source_url: r.source_url,
      performers: linked,
      extra_names: extra,
    });
  }

  return <UndergroundEventList rows={rows} />;
}
