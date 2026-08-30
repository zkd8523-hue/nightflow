import { createClient } from "@/lib/supabase/client";
import { getBusinessDateISO } from "@/lib/lineups/time";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";

/**
 * 우승 화면의 "취향 리포트" 데이터.
 *
 * 유형 이름은 짓지 않는다 — 근거가 "고른 DJ들의 장르 분포"뿐인데 거기에
 * "하우스 탐닉형" 같은 라벨을 붙이면 데이터가 말하지 않은 것을 지어내는 게
 * 된다. 계산으로 나온 사실(분포·편중도·추천 클럽 근거)만 보여준다.
 */

/** Migration 616 의 대분류 6종. DB CHECK 제약과 같은 집합이다. */
export type DjGenre = "House" | "Techno" | "EDM" | "HipHop" | "RnB" | "Global";

export const GENRE_LABEL: Record<DjGenre, string> = {
  House: "하우스",
  Techno: "테크노",
  EDM: "EDM",
  HipHop: "힙합",
  RnB: "R&B",
  Global: "월드",
};

export interface GenreSlice {
  genre: DjGenre;
  label: string;
  /** 고른 DJ 중 이 장르가 차지하는 비율(0~100, 합계 100). */
  pct: number;
  count: number;
}

export interface RecommendedClub {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  /** 내가 고른 DJ 중 이 클럽에서 플레이하는 사람 수 — 추천의 근거다. */
  djCount: number;
}

export interface TasteReport {
  /** 내림차순. 장르를 못 매긴 DJ 는 분모에서 빠진다. */
  genres: GenreSlice[];
  /** 장르가 확인된 DJ 수(=분모). 이게 작으면 분포를 믿을 수 없다. */
  analyzed: number;
  /** 1위 장르에 해당하는 DJ 수. "8명 중 5명이 힙합"의 5. */
  topCount: number;
  clubs: RecommendedClub[];
}

interface ClubRow {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  is_test: boolean;
  status: string;
  deleted_at: string | null;
}

/** fetchDjShows 의 isVisibleClub 과 같은 규약 — 미승인·테스트 클럽을 거른다. */
function isVisibleClub(c: ClubRow | null | undefined): c is ClubRow {
  if (!c || c.deleted_at) return false;
  if (!SHOW_TEST_DATA && (c.is_test || c.status !== "approved")) return false;
  return true;
}

/**
 * @param pickedDjIds 이번 판에서 유저가 "선택하기"를 누른 DJ 들(중복 없이).
 *   패배자는 넣지 않는다 — 고른 것만이 취향이다.
 */
export async function fetchTasteReport(pickedDjIds: string[]): Promise<TasteReport> {
  const empty: TasteReport = { genres: [], analyzed: 0, topCount: 0, clubs: [] };
  const ids = [...new Set(pickedDjIds)].filter(Boolean);
  if (ids.length === 0) return empty;

  const supabase = createClient();

  // ── 장르 분포 ──────────────────────────────────────────────
  const { data: djs } = await supabase.from("djs").select("id, genre").in("id", ids);

  const counts = new Map<DjGenre, number>();
  for (const d of djs ?? []) {
    const g = d.genre as DjGenre | null;
    if (!g) continue; // 근거 없는 DJ 는 분모에서도 뺀다
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const analyzed = [...counts.values()].reduce((a, b) => a + b, 0);

  const genres: GenreSlice[] = [...counts.entries()]
    .map(([genre, count]) => ({
      genre,
      label: GENRE_LABEL[genre],
      count,
      pct: Math.round((count / analyzed) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // ── 추천 클럽 ──────────────────────────────────────────────
  // "고른 DJ 가 실제로 서는 무대"라서 추천의 근거가 분명하다. 지난 기록까지
  // 포함한다 — 예정 라인업만 보면 대부분 0건이 되어 섹션이 비어버린다.
  const { data: sets } = await supabase
    .from("lineup_sets")
    .select(
      "dj_id, club_lineups!inner(event_date, clubs!inner(id, name, area, thumbnail_url, is_test, status, deleted_at))"
    )
    .in("dj_id", ids)
    .limit(400);

  // 클럽별로 "서로 다른" DJ 수를 센다 — 한 DJ 가 같은 클럽에서 여러 번 플레이해도 1이다.
  const clubDjs = new Map<string, { club: ClubRow; djIds: Set<string> }>();
  for (const row of (sets ?? []) as unknown as Array<{
    dj_id: string;
    club_lineups: { clubs: ClubRow | ClubRow[] } | { clubs: ClubRow | ClubRow[] }[] | null;
  }>) {
    const lineup = Array.isArray(row.club_lineups) ? row.club_lineups[0] : row.club_lineups;
    if (!lineup) continue;
    const club = Array.isArray(lineup.clubs) ? lineup.clubs[0] : lineup.clubs;
    if (!isVisibleClub(club)) continue;
    if (!clubDjs.has(club.id)) clubDjs.set(club.id, { club, djIds: new Set() });
    clubDjs.get(club.id)!.djIds.add(row.dj_id);
  }

  const clubs: RecommendedClub[] = [...clubDjs.values()]
    .map(({ club, djIds }) => ({
      id: club.id,
      name: club.name,
      area: club.area,
      thumbnail_url: club.thumbnail_url,
      djCount: djIds.size,
    }))
    .sort((a, b) => b.djCount - a.djCount || a.name.localeCompare(b.name))
    .slice(0, 4);

  return { genres, analyzed, topCount: genres[0]?.count ?? 0, clubs };
}

/** 오늘 이후 라인업이 있는 클럽 id 집합 — "이번 주 라인업 있음" 배지용. */
export async function fetchClubsWithUpcoming(clubIds: string[]): Promise<Set<string>> {
  if (clubIds.length === 0) return new Set();
  const supabase = createClient();
  const { data } = await supabase
    .from("club_lineups")
    .select("club_id, event_date")
    .in("club_id", clubIds)
    .gte("event_date", getBusinessDateISO())
    .limit(200);
  return new Set((data ?? []).map((r) => r.club_id as string));
}
