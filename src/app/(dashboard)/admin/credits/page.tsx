import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BankCreditManager, type BankCreditRow } from "@/components/admin/BankCreditManager";

export const dynamic = "force-dynamic";

/**
 * 관리자 — 계좌이체 크레딧 충전 입금확인.
 * 대기목록에서 입금자명/금액을 통장과 대사한 뒤 [적립]. 딥링크(?id=)로 특정 신청 하이라이트.
 */
export default async function AdminCreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const supabase = await createClient();

  // 미들웨어가 auth + role 체크를 완료하고 헤더로 전달
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) redirect("/login");
    const { data: ud } = await supabase
      .from("users")
      .select("role")
      .eq("id", authUser.id)
      .single();
    if (ud?.role !== "admin") redirect("/");
  }

  const { id: highlightId } = await searchParams;

  const selectCols =
    "id, payment_id, credits, amount, depositor_name, status, created_at, paid_at, md:users!credit_payments_md_id_fkey(id, name, display_name, phone)";

  const admin = createAdminClient();
  const [{ data: pending }, { data: recent }] = await Promise.all([
    admin
      .from("credit_payments")
      .select(selectCols)
      .eq("method", "bank_transfer")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    admin
      .from("credit_payments")
      .select(selectCols)
      .eq("method", "bank_transfer")
      .in("status", ["paid", "cancelled", "failed"])
      .order("updated_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin"
          className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border"
        >
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <h1 className="text-xl font-black text-foreground flex-1">크레딧 입금확인</h1>
      </div>

      <BankCreditManager
        pending={(pending ?? []) as unknown as BankCreditRow[]}
        recent={(recent ?? []) as unknown as BankCreditRow[]}
        highlightId={highlightId ?? null}
      />
    </div>
  );
}
