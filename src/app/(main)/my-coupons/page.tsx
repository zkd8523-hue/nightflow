import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MyCouponList } from "@/components/coupon/MyCouponList";
import type { CouponClaim } from "@/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "내 쿠폰함 — NightFlow",
};

export default async function MyCouponsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/my-coupons");

  const { data: claims } = await supabase
    .from("coupon_claims")
    .select(`*, club:clubs(id, name, area, thumbnail_url), issue:coupon_issues(id, title, thumbnail_url, club_id)`)
    .eq("user_id", user.id)
    .order("claimed_at", { ascending: false });

  return (
    <div className="container mx-auto max-w-lg px-4 pt-4 pb-28">
      <MyCouponList claims={(claims ?? []) as unknown as CouponClaim[]} />
    </div>
  );
}
