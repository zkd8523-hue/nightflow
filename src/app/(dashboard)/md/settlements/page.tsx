// MD 본인 정산 내역(2026-11-01). 대시보드 정산 카드·앱 푸시(p_url)가 여기로 온다.
// 정산 문자 링크 /booking/settle(앱 링크)도 여기로 넘어온다.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMdSettlement } from "@/lib/booking/settlements";
import { MdSettlementView, defaultSettlementMonth } from "@/components/md/MdSettlementView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "정산 내역", robots: { index: false, follow: false } };

export default async function MdSettlementsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/md/settlements");
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "md" && me?.role !== "admin") redirect("/");

  const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  // settlement_* 테이블은 관리자 전용 RLS라 서버에서 service role로 읽고, 본인 md_id로만 거른다.
  const months = await loadMdSettlement(createAdminClient(), user.id, todayKst);
  const { month } = await searchParams;
  const selected = month && months.some((m) => m.month === month) ? month : defaultSettlementMonth(months);

  return (
    <MdSettlementView
      months={months}
      selected={selected}
      basePath="/md/settlements"
      backHref="/md/dashboard"
      todayKst={todayKst}
    />
  );
}
