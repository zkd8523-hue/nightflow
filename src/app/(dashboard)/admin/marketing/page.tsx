import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, Megaphone, CheckCircle2, XCircle, Phone } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { MarketingConsentTable } from "@/components/admin/MarketingConsentTable";

export default async function AdminMarketingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userData?.role !== "admin") redirect("/");

  const { data: users } = await supabase
    .from("users")
    .select("id, display_name, phone, role, alimtalk_consent, alimtalk_consent_at, created_at, deleted_at, is_blocked")
    .is("deleted_at", null)
    .neq("role", "admin")
    .order("created_at", { ascending: false });

  const list = users ?? [];
  const total = list.length;
  const consented = list.filter(u => u.alimtalk_consent === true).length;
  const consentedWithPhone = list.filter(u => u.alimtalk_consent === true && u.phone && !u.is_blocked).length;
  const noConsent = total - consented;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pt-12 pb-24">
      <div className="max-w-7xl mx-auto px-6 space-y-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Link href="/admin" className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 hover:border-neutral-700 transition-colors">
                <ChevronLeft className="w-5 h-5 text-neutral-400" />
              </Link>
              <div className="flex items-center gap-2 text-neutral-500 font-bold uppercase tracking-widest text-[11px]">
                <Megaphone className="w-3.5 h-3.5" />
                Marketing Consent
              </div>
            </div>
            <h1 className="text-4xl font-black tracking-tighter">마케팅 수신 동의</h1>
            <p className="text-neutral-500 font-medium">유저별 동의 여부 확인 및 발송 대상자 CSV 추출</p>
          </div>

          <div className="flex gap-4">
            <Card className="bg-[#1C1C1E] border-neutral-800 p-4 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-neutral-500">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">동의</span>
              </div>
              <span className="text-3xl font-black text-green-400">{consented.toLocaleString()}</span>
            </Card>
            <Card className="bg-[#1C1C1E] border-neutral-800 p-4 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-neutral-500">
                <Phone className="w-4 h-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">발송가능</span>
              </div>
              <span className="text-3xl font-black text-amber-400">{consentedWithPhone.toLocaleString()}</span>
            </Card>
            <Card className="bg-[#1C1C1E] border-neutral-800 p-4 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-neutral-500">
                <XCircle className="w-4 h-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">미동의</span>
              </div>
              <span className="text-3xl font-black text-neutral-500">{noConsent.toLocaleString()}</span>
            </Card>
          </div>
        </header>

        <MarketingConsentTable users={list} />
      </div>
    </div>
  );
}
