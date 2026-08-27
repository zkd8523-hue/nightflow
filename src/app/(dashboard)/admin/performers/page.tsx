import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PerformerInstagramList, type PerformerRow } from "@/components/admin/PerformerInstagramList";

export const dynamic = "force-dynamic";

/** 오늘(KST) 이후 = "예정" 판정 기준 */
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function AdminPerformersPage() {
  const supabase = await createClient();

  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", authUser.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  const today = todayKST();

  // ── 아티스트: 출연 횟수 + 예정 여부 + 장소 힌트 ──────────────────────────
  const [{ data: artists }, { data: perfs }, { data: upcomingEvents }] = await Promise.all([
    supabase.from("artists").select("id, display_name, instagram").is("deleted_at", null),
    supabase.from("club_event_performers").select("artist_id, event_id"),
    supabase.from("club_events").select("id, club_name_raw, event_date").gte("event_date", today),
  ]);

  const upcomingEventMap = new Map((upcomingEvents ?? []).map((e) => [e.id, e.club_name_raw]));
  const countByArtist = new Map<string, number>();
  const upcomingByArtist = new Map<string, string>();
  for (const p of perfs ?? []) {
    countByArtist.set(p.artist_id, (countByArtist.get(p.artist_id) ?? 0) + 1);
    const venue = upcomingEventMap.get(p.event_id);
    if (venue && !upcomingByArtist.has(p.artist_id)) upcomingByArtist.set(p.artist_id, venue);
  }

  // 화면에 올릴 대상: 다가오는 공연 출연자 OR 3회 이상 출연.
  // 전체 1,100명 중 대부분은 1회짜리(게스트·오파싱 잔여)라 사람이 볼 이유가 없다.
  const artistRows: PerformerRow[] = (artists ?? [])
    .map((a) => ({
      id: a.id,
      kind: "artist" as const,
      display_name: a.display_name,
      instagram: a.instagram,
      event_count: countByArtist.get(a.id) ?? 0,
      upcoming: upcomingByArtist.has(a.id),
      hint: upcomingByArtist.get(a.id) ?? null,
    }))
    .filter((r) => r.upcoming || r.event_count >= 3);

  // ── DJ: 15명뿐이라 전원 노출. 레지던트 클럽명을 힌트로 준다 ────────────
  const [{ data: djs }, { data: sets }] = await Promise.all([
    supabase.from("djs").select("id, display_name, instagram, resident_club_id").is("deleted_at", null),
    supabase.from("lineup_sets").select("dj_id, lineup_id"),
  ]);

  const countByDj = new Map<string, number>();
  for (const s of sets ?? []) {
    if (s.dj_id) countByDj.set(s.dj_id, (countByDj.get(s.dj_id) ?? 0) + 1);
  }

  // DJ가 선 클럽 이름 — 동명이인 검색 시 결정적인 힌트가 된다
  const { data: lineupClubs } = await supabase
    .from("club_lineups")
    .select("id, clubs(name)");
  const clubNameByLineup = new Map(
    (lineupClubs ?? []).map((l: { id: string; clubs: unknown }) => {
      const c = Array.isArray(l.clubs) ? l.clubs[0] : l.clubs;
      return [l.id, (c as { name?: string } | null)?.name ?? null];
    })
  );
  const hintByDj = new Map<string, string>();
  for (const s of sets ?? []) {
    if (!s.dj_id || hintByDj.has(s.dj_id)) continue;
    const n = clubNameByLineup.get(s.lineup_id);
    if (n) hintByDj.set(s.dj_id, n);
  }

  const djRows: PerformerRow[] = (djs ?? []).map((d) => ({
    id: d.id,
    kind: "dj" as const,
    display_name: d.display_name,
    instagram: d.instagram,
    event_count: countByDj.get(d.id) ?? 0,
    upcoming: false,
    hint: hintByDj.get(d.id) ?? null,
  }));

  // 예정 출연자 우선 → 출연 횟수 많은 순
  const rows = [...djRows, ...artistRows].sort(
    (a, b) => Number(b.upcoming) - Number(a.upcoming) || b.event_count - a.event_count
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          관리자 홈
        </Link>

        <h1 className="text-xl font-black">아티스트·DJ 인스타 연결</h1>
        <p className="mb-6 mt-1 text-sm text-neutral-500">
          검색 링크로 계정을 확인한 뒤 핸들이나 인스타 URL을 붙여넣고 저장하세요. 클럽이 게시물에
          태그하면 자동으로도 채워지므로, 여기서는 자주 나오거나 곧 공연하는 사람만 다룹니다.
        </p>

        <PerformerInstagramList rows={rows} />
      </div>
    </div>
  );
}
