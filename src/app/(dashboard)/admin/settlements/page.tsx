import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettlementRows, loadMonthRates, type SettlementNotice, type SettlementPayment } from "@/lib/booking/settlements";
import { SettlementsClient } from "@/components/admin/SettlementsClient";

export const dynamic = "force-dynamic";

// MD 정산(2026-10-04) — 확정 건을 방문 월·클럽·MD별로 묶어 수수료(5%)를 보고, MD에게 바로 안내를 보낸다.
export default async function AdminSettlementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/");

  const sb = createAdminClient();
  const rows = await loadSettlementRows(sb);
  const { data: notices } = await sb
    .from("settlement_notices")
    .select("month, md_id, channel, sent_at, fee_amount, sent_by")
    .order("sent_at", { ascending: false })
    .limit(500);
  const rates = await loadMonthRates(sb);
  const { data: payments } = await sb.from("settlement_payments").select("month, md_id, paid_at");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight">💰 MD 정산</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            방문일 기준 월 · 확정 금액의 5%(달별로 다를 수 있음, 9월 4%) · 익월 10일까지. 외국인 확정은 기본 포함, 한국 확정은 건별로 켜서 넣어요.
          </p>
        </div>
        <SettlementsClient rows={rows} notices={(notices ?? []) as SettlementNotice[]} rates={rates} payments={(payments ?? []) as SettlementPayment[]} />
      </div>
    </div>
  );
}
