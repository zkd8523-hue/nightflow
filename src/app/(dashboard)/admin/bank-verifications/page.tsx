import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BankVerificationManager } from "@/components/admin/BankVerificationManager";

export default async function BankVerificationsPage() {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) redirect("/login");

    const { data: adminUser } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

    if (!adminUser || adminUser.role !== "admin") {
        redirect("/");
    }

    // 검증 대기 중인 요청 조회
    const { data: pendingVerifications } = await supabase
        .from("bank_verifications")
        .select(`
            *,
            md:users!bank_verifications_md_id_fkey(id, name, phone, email)
        `)
        .eq("verification_status", "pending")
        .order("created_at", { ascending: false });

    // 최근 처리된 검증 이력 조회
    const { data: recentVerifications } = await supabase
        .from("bank_verifications")
        .select(`
            *,
            md:users!bank_verifications_md_id_fkey(id, name),
            verifier:users!bank_verifications_verified_by_fkey(name)
        `)
        .in("verification_status", ["verified", "rejected"])
        .order("verified_at", { ascending: false })
        .limit(20);

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white">
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-black text-white mb-2">계좌 검증 관리</h1>
                    <p className="text-neutral-500">MD 정산 계좌 실명 확인 및 승인/거부</p>
                </div>

                <BankVerificationManager
                    pendingVerifications={pendingVerifications || []}
                    recentVerifications={recentVerifications || []}
                    adminId={authUser.id}
                />
            </div>
        </div>
    );
}
