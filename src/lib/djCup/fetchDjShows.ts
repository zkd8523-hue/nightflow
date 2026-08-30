import { createClient } from "@/lib/supabase/client";
import { getBusinessDateISO } from "@/lib/lineups/time";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import type { DjShowRow } from "@/components/djs/DjLedShowList";

interface ClubRef {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  is_test: boolean;
  status: string;
  deleted_at: string | null;
}

interface RawSetRow {
  start_min: number | null;
  club_lineups:
    | { event_date: string; clubs: ClubRef | ClubRef[] }
    | { event_date: string; clubs: ClubRef | ClubRef[] }[]
    | null;
}

/** dj/[slug]/page.tsx의 isVisibleClub과 동일 규약. DjProfileSheet의 일정
 *  쿼리에는 이 필터가 빠져 있어(기존 결함) 미승인/테스트 클럽 일정이 샐 수
 *  있다 — 우승 화면은 바이럴 랜딩이라 여기서 그대로 복사하면 안 된다. */
function isVisibleClub(c: ClubRef | null): c is ClubRef {
  if (!c || c.deleted_at) return false;
  if (!SHOW_TEST_DATA && (c.is_test || c.status !== "approved")) return false;
  return true;
}

function toRows(raw: RawSetRow[] | null): DjShowRow[] {
  const rows: DjShowRow[] = [];
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
  }
  return rows;
}

/** DJ 컵 우승 화면 전용 — 예정 일정만, 최대 20건. dj/[slug]/page.tsx의
 *  fetchDj()와 같은 쿼리·필터를 클라이언트에서 재현한다(그쪽은 서버 컴포넌트라
 *  그대로 import할 수 없다). */
export async function fetchUpcomingDjShows(djId: string): Promise<DjShowRow[]> {
  const supabase = createClient();
  const today = getBusinessDateISO();

  const { data } = await supabase
    .from("lineup_sets")
    .select(
      "start_min, club_lineups!inner(event_date, clubs!inner(id, name, area, thumbnail_url, is_test, status, deleted_at))"
    )
    .eq("dj_id", djId)
    .gte("club_lineups.event_date", today)
    .limit(60);

  return toRows(data as unknown as RawSetRow[])
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.start_min ?? 0) - (b.start_min ?? 0))
    .slice(0, 20);
}
