import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, Megaphone, CheckCircle2, XCircle, Phone } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { MarketingConsentTable } from "@/components/admin/MarketingConsentTable";

export default async function AdminMarketingPage() {
  const supabase = await createClient();

  // 미들웨어가 auth + role 체크를 완료하고 헤더로 전달
  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

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
    <div className="min-h-screen bg-background text-foreground pt-12 pb-24">
      <div className="max-w-7xl mx-auto px-6 space-y-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Link href="/admin" className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border hover:border-border transition-colors">
                <ChevronLeft className="w-5 h-5 text-muted-foreground" />
              </Link>
              <div className="flex items-center gap-2 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">
                <Megaphone className="w-3.5 h-3.5" />
                Marketing Consent
              </div>
            </div>
            <h1 className="text-4xl font-black tracking-tighter">마케팅 수신 동의</h1>
            <p className="text-muted-foreground font-medium">유저별 동의 여부 확인 및 발송 대상자 CSV 추출</p>
          </div>

          <div className="flex gap-4">
            <Card className="bg-card border-border p-4 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">동의</span>
              </div>
              <span className="text-3xl font-black text-money">{consented.toLocaleString()}</span>
            </Card>
            <Card className="bg-card border-border p-4 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">발송가능</span>
              </div>
              <span className="text-3xl font-black text-brand-amber">{consentedWithPhone.toLocaleString()}</span>
            </Card>
            <Card className="bg-card border-border p-4 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-muted-foreground">
                <XCircle className="w-4 h-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">미동의</span>
              </div>
              <span className="text-3xl font-black text-muted-foreground">{noConsent.toLocaleString()}</span>
            </Card>
          </div>
        </header>

        <MarketingConsentTable users={list} />
      </div>
    </div>
  );
}
