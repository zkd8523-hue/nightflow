import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import type { DiscoveryDj } from "@/components/lineups/DjDiscoveryCard";

/**
 * DjDiscoveryCard("당신을 뛰게 할 DJ는?")가 그릴 목록을 raw row에서 뽑아내는
 * 순수 가공 로직. page.tsx(RSC)에서 SSR로 호출해 props로 넘기기 위해 컴포넌트
 * 파일에서 분리했다 — lineupTickerData와 같은 규약("use client" 없이 서버에서 호출).
 *
 * 규칙은 /lineups의 discoveryDjs와 같다: 미리듣기(사운드클라우드·유튜브)가 있는
 * DJ만, 같은 DJ가 여러 날 뛰면 가장 가까운 날 하나만.
 */

type ClubRef = {
  id: string;
  name: string;
  area: string | null;
  is_test: boolean;
  status: string;
  deleted_at: string | null;
};

type DjRef = {
  id: string;
  slug: string;
  display_name: string;
  instagram: string | null;
  soundcloud_url: string | null;
  youtube_url: string | null;
};

export type DiscoverySetRow = {
  start_min: number | null;
  djs: DjRef | DjRef[] | null;
  club_lineups:
    | { event_date: string; clubs: ClubRef | ClubRef[] }
    | { event_date: string; clubs: ClubRef | ClubRef[] }[]
    | null;
};

const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? v[0] ?? null : v;

export function buildDjDiscoveryItems(rows: DiscoverySetRow[] | null): DiscoveryDj[] {
  // 날짜·시간순으로 먼저 훑어야 "가장 가까운 날"이 남는다 —
  // DB 등록순 그대로면 같은 DJ의 먼 날짜가 먼저 잡힐 수 있다.
  const flat: Array<DiscoveryDj> = [];
  for (const r of rows ?? []) {
    const dj = one(r.djs);
    const lineup = one(r.club_lineups);
    if (!dj || !lineup) continue;
    const club = one(lineup.clubs);
    // club_lineups에는 is_test가 없어 clubs 조인으로 거른다(558 규약)
    if (!club || club.deleted_at || club.status !== "approved") continue;
    if (!SHOW_TEST_DATA && club.is_test) continue;
    // 사클이 없어도 유튜브가 있으면 들을 수 있다
    if (!dj.soundcloud_url && !dj.youtube_url) continue;
    flat.push({
      dj: {
        id: dj.id,
        slug: dj.slug,
        display_name: dj.display_name,
        instagram: dj.instagram,
        soundcloud_url: dj.soundcloud_url,
        youtube_url: dj.youtube_url,
      },
      club_id: club.id,
      club_name: club.name,
      club_area: club.area,
      event_date: lineup.event_date,
      start_min: r.start_min,
    });
  }

  flat.sort(
    (a, b) =>
      a.event_date.localeCompare(b.event_date) ||
      (a.start_min ?? Number.MAX_SAFE_INTEGER) - (b.start_min ?? Number.MAX_SAFE_INTEGER)
  );

  const seen = new Map<string, DiscoveryDj>();
  for (const it of flat) {
    if (!seen.has(it.dj.id)) seen.set(it.dj.id, it);
  }
  return [...seen.values()];
}
