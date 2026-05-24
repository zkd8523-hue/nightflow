import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HotdealSlotBoard } from "@/components/md/HotdealSlotBoard";

export const metadata = {
  title: "HOT DEAL 슬롯 — NightFlow",
};

export default async function MDHotdealPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("id, role, name, display_name")
    .eq("id", user.id)
    .single();
  if (!userRow || (userRow.role !== "md" && userRow.role !== "admin")) {
    redirect("/");
  }

  // MD가 partner인 클럽 목록 (Migration 177 패턴)
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url, club_partners!inner(md_id)")
    .eq("club_partners.md_id", user.id)
    .is("deleted_at", null)
    .order("name");

  // 이번 주 내가 차지한/다른 MD가 차지한 슬롯 모두 조회
  // (KST 기준 이번 주 월~일)
  const today = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(today.getTime() + kstOffset);
  const kstDow = kstNow.getUTCDay(); // 0=일~6=토
  const daysFromMonday = kstDow === 0 ? 6 : kstDow - 1;
  const weekStart = new Date(kstNow);
  weekStart.setUTCDate(kstNow.getUTCDate() - daysFromMonday);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

  const clubIds = (clubs ?? []).map((c) => c.id);
  const { data: slots } = clubIds.length
    ? await supabase
        .from("weekly_hotdeal_slots")
        .select("id, club_id, md_id, slot_date, benefit_text, expires_at")
        .in("club_id", clubIds)
        .gte("slot_date", weekStart.toISOString().slice(0, 10))
        .lt("slot_date", weekEnd.toISOString().slice(0, 10))
    : { data: [] };

  // 본인의 이번 주 슬롯 (주 1슬롯 룰 표시용)
  const { data: myWeekSlot } = await supabase
    .from("weekly_hotdeal_slots")
    .select("id, club_id, slot_date, benefit_text, expires_at")
    .eq("md_id", user.id)
    .gte("slot_date", weekStart.toISOString().slice(0, 10))
    .lt("slot_date", weekEnd.toISOString().slice(0, 10))
    .maybeSingle();

  return (
    <HotdealSlotBoard
      currentUserId={user.id}
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
        slot_date: s.slot_date,
        benefit_text: s.benefit_text,
        expires_at: s.expires_at,
      }))}
      myWeekSlot={myWeekSlot ?? null}
      weekStartISO={weekStart.toISOString().slice(0, 10)}
    />
  );
}
