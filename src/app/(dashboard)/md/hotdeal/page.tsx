import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HotdealSlotBoard } from "@/components/md/HotdealSlotBoard";
import type { HotdealBenefitsByDow } from "@/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "게스트 간판 — NightFlow",
};

function weekStartKst(d: Date): string {
  // KST 기준 그 주의 월요일 ISO (YYYY-MM-DD)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const dow = kst.getUTCDay(); // 0=일~6=토
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(kst);
  monday.setUTCDate(kst.getUTCDate() - daysFromMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function MDHotdealPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (!userRow || (userRow.role !== "md" && userRow.role !== "admin")) {
    redirect("/");
  }

  const { data: partnerClubs } = await supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url, club_partners!inner(md_id)")
    .eq("club_partners.md_id", user.id)
    .is("deleted_at", null)
    .order("name");

  // 비프로덕션(dev/preview) + admin: 운영자 테스트 클럽 추가 노출
  const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
  const showTestClubs = !isProd && userRow.role === "admin";
  let clubs = partnerClubs ?? [];
  if (showTestClubs) {
    const { data: testClubs } = await supabase
      .from("clubs")
      .select("id, name, area, thumbnail_url")
      .ilike("name", "%운영자%")
      .is("deleted_at", null);
    const existing = new Set(clubs.map((c) => c.id));
    for (const tc of testClubs ?? []) {
      if (!existing.has(tc.id)) {
        clubs.push({ ...tc, club_partners: [] } as typeof clubs[number]);
      }
    }
  }

  const thisWeek = weekStartKst(new Date());
  const nextWeek = addDaysISO(thisWeek, 7);

  const clubIds = clubs.map((c) => c.id);
  // 이번 주 + 다음 주 슬롯 동시 조회
  const { data: slots } = clubIds.length
    ? await supabase
        .from("weekly_hotdeal_slots")
        .select("id, club_id, md_id, week_start, benefits_by_dow, expires_at")
        .in("club_id", clubIds)
        .in("week_start", [thisWeek, nextWeek])
    : { data: [] };

  // 본인 슬롯 (이번주/다음주). 소속(파트너 연결) 클럽 슬롯만 노출한다.
  // club_partners 연결이 없는 클럽의 슬롯은 clubs 목록에 없어 이름을 못 찾고
  // "클럽"으로 떨어지므로, 소속 클럽(clubIds) 범위로 제한한다.
  const { data: mySlots } = clubIds.length
    ? await supabase
        .from("weekly_hotdeal_slots")
        .select("id, club_id, week_start, benefits_by_dow, expires_at")
        .eq("md_id", user.id)
        .in("club_id", clubIds)
        .gte("week_start", thisWeek)
        .lte("week_start", nextWeek)
    : { data: [] };

  return (
    <HotdealSlotBoard
      currentUserId={user.id}
      isAdmin={userRow.role === "admin"}
      clubs={(clubs ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        area: c.area,
        thumbnail_url: c.thumbnail_url,
      }))}
      slots={(slots ?? []).map((s) => ({
        id: s.id,
        club_id: s.club_id,
        md_id: s.md_id,
        week_start: s.week_start,
        benefits_by_dow: (s.benefits_by_dow ?? {}) as HotdealBenefitsByDow,
        expires_at: s.expires_at,
      }))}
      mySlots={(mySlots ?? []).map((s) => ({
        id: s.id,
        club_id: s.club_id,
        week_start: s.week_start,
        benefits_by_dow: (s.benefits_by_dow ?? {}) as HotdealBenefitsByDow,
        expires_at: s.expires_at,
      }))}
      thisWeekISO={thisWeek}
      nextWeekISO={nextWeek}
    />
  );
}
