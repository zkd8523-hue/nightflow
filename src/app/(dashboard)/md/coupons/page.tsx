import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CouponManager } from "@/components/md/CouponManager";
import type { CouponIssue } from "@/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "쿠폰 발행 — NightFlow",
};

export default async function MDCouponsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("id, role, default_club_id")
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

  // 비프로덕션(dev/preview) + admin: 운영자 테스트 클럽 추가 노출 (238 패턴)
  const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
  const showTestClubs = !isProd && userRow.role === "admin";
  const clubs = partnerClubs ?? [];
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

  const { data: myCoupons } = await supabase
    .from("coupon_issues")
    .select("*, club:clubs(id, name, area, thumbnail_url)")
    .eq("md_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <CouponManager
      clubs={(clubs ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        area: c.area,
        thumbnail_url: c.thumbnail_url,
      }))}
      initialCoupons={(myCoupons ?? []) as unknown as CouponIssue[]}
      mdId={user.id}
      defaultClubId={userRow.default_club_id}
    />
  );
}
