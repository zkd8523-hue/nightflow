import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CreditRecharge } from "@/components/md/CreditRecharge";
import { BusinessInfo } from "@/components/layout/BusinessInfo";

export const metadata = {
  title: "크레딧 충전 | NightFlow",
  description: "나이트플로우 플랫폼 이용 크레딧을 충전합니다.",
};

export default async function MDCreditsPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  const { data: mdUser } = await supabase
    .from("users")
    .select("role, md_credits")
    .eq("id", authUser.id)
    .single();

  if (!mdUser || (mdUser.role !== "md" && mdUser.role !== "admin")) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/md/dashboard"
            className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <h1 className="text-xl font-black text-white">크레딧 충전</h1>
        </div>

        <CreditRecharge currentCredits={mdUser.md_credits ?? 0} />

        {/* 결제페이지 사업자정보 상시 노출 (PG/카드사 심사 요건) */}
        <div className="mt-10 pt-6 border-t border-neutral-900">
          <BusinessInfo />
        </div>
      </div>
    </div>
  );
}
