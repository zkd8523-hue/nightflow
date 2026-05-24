import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HotdealSlotBoard } from "@/components/md/HotdealSlotBoard";
import type { HotdealBenefitsByDow } from "@/types/database";

export const metadata = {
  title: "HOT DEAL 슬롯 — NightFlow",
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

  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url, club_partners!inner(md_id)")
    .eq("club_partners.md_id", user.id)
    .is("deleted_at", null)
    .order("name");

  const thisWeek = weekStartKst(new Date());
  const nextWeek = addDaysISO(thisWeek, 7);

  const clubIds = (clubs ?? []).map((c) => c.id);
  // 이번 주 + 다음 주 슬롯 동시 조회
  const { data: slots } = clubIds.length
    ? await supabase
        .from("weekly_hotdeal_slots")
        .select("id, club_id, md_id, week_start, benefits_by_dow, expires_at")
        .in("club_id", clubIds)
        .in("week_start", [thisWeek, nextWeek])
    : { data: [] };

  // 본인 슬롯 (1MD 1주 1슬롯 — 이번주/다음주 각각 최대 1개)
  const { data: mySlots } = await supabase
    .from("weekly_hotdeal_slots")
    .select("id, club_id, week_start, benefits_by_dow, expires_at")
    .eq("md_id", user.id)
    .in("week_start", [thisWeek, nextWeek]);

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
