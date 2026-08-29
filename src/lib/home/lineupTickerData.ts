import { SHOW_TEST_DATA } from "@/lib/utils/testData";

/**
 * LineupTicker(홈 상단 LED 전광판)가 그릴 두 줄(DJ 라인업 / 언더그라운드 공연)을
 * raw row에서 뽑아내는 순수 가공 로직. page.tsx(RSC)에서 SSR로 호출해 props로
 * 넘기기 위해 컴포넌트 파일에서 분리했다 — "use client" 없이 서버/클라이언트
 * 어디서나 호출 가능해야 한다.
 */

type ClubRef = {
  name: string;
  is_test: boolean;
  status: string;
  deleted_at: string | null;
};

export type LineupSetRow = {
  start_min: number | null;
  djs: { display_name: string } | { display_name: string }[] | null;
  club_lineups:
    | { event_date: string; clubs: ClubRef | ClubRef[] }
    | { event_date: string; clubs: ClubRef | ClubRef[] }[]
    | null;
};

export type ClubEventRow = {
  event_date: string | null;
  title: string | null;
  club_name_raw: string | null;
  lineup: string[] | null;
};

const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? v[0] ?? null : v;

export function buildLineupTickerData(
  lineupRows: LineupSetRow[] | null,
  eventRows: ClubEventRow[] | null
): { djNames: string[]; eventLabels: string[] } {
  // ── DJ 라인업 ──
  const rows: Array<{ date: string; start: number; name: string }> = [];
  for (const r of lineupRows ?? []) {
    const dj = one(r.djs);
    const lineup = one(r.club_lineups);
    if (!dj || !lineup) continue;
    const club = one(lineup.clubs);
    // club_lineups에는 is_test가 없어 clubs 조인으로 거른다(558 규약)
    if (!club || club.deleted_at || club.status !== "approved") continue;
    if (!SHOW_TEST_DATA && club.is_test) continue;
    rows.push({ date: lineup.event_date, start: r.start_min ?? Number.MAX_SAFE_INTEGER, name: dj.display_name });
  }
  // 가장 가까운 날짜의 셋만, 시간순으로 — 여러 날짜를 섞으면 순서가 뒤죽박죽이 된다
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  const firstDate = rows[0]?.date;
  const djNames = [
    ...new Set(rows.filter((r) => r.date === firstDate).map((r) => r.name)),
  ].slice(0, 12);

  // ── 언더그라운드 공연 ──
  const labels: string[] = [];
  for (const e of eventRows ?? []) {
    if (!e.event_date) continue;
    const [, m, d] = e.event_date.split("-");
    // 아티스트명이 있으면 그게 제일 눈에 띈다. 없으면 공연 제목, 그것도 없으면 클럽명.
    const who = e.lineup?.[0]?.trim() || e.title?.trim() || e.club_name_raw?.trim();
    if (!who) continue;
    labels.push(`${parseInt(m, 10)}/${parseInt(d, 10)} ${who}`);
  }
  const eventLabels = labels.slice(0, 12);

  return { djNames, eventLabels };
}
