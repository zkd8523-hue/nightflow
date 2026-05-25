import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HotdealNowManager } from "@/components/md/HotdealNowManager";
import type { DailyHotdeal } from "@/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Hot Deal 등록 — NightFlow",
};

export default async function MDHotdealNowPage() {
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

  // MD가 partner인 클럽 (admin은 + 운영자 테스트 클럽)
  const { data: partnerClubs } = await supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url, floor_plan_url, club_partners!inner(md_id)")
    .eq("club_partners.md_id", user.id)
    .is("deleted_at", null)
    .order("name");

  const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
  const showTestClubs = !isProd && userRow.role === "admin";
  let clubs = (partnerClubs ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    area: c.area,
    thumbnail_url: c.thumbnail_url,
    floor_plan_url: c.floor_plan_url,
  }));
  if (showTestClubs) {
    const { data: testClubs } = await supabase
      .from("clubs")
      .select("id, name, area, thumbnail_url, floor_plan_url")
      .ilike("name", "%운영자%")
      .is("deleted_at", null);
    const existing = new Set(clubs.map((c) => c.id));
    for (const tc of testClubs ?? []) {
      if (!existing.has(tc.id)) {
        clubs.push({
          id: tc.id,
          name: tc.name,
          area: tc.area,
          thumbnail_url: tc.thumbnail_url,
          floor_plan_url: tc.floor_plan_url,
        });
      }
    }
  }

  // 본인이 등록한 활성 핫딜
  const { data: myHotdeals } = await supabase
    .from("daily_hotdeals")
    .select("*, club:clubs(id, name, area, thumbnail_url)")
    .eq("md_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <HotdealNowManager
      clubs={clubs}
      initialMyHotdeals={(myHotdeals ?? []) as unknown as DailyHotdeal[]}
    />
  );
}
