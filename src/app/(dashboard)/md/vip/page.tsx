import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VIPDashboard } from "@/components/md/VIPDashboard";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function MDVipPage() {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) redirect("/login");

    const { data: mdUser } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

    if (!mdUser || (mdUser.role !== "md" && mdUser.role !== "admin")) {
        redirect("/");
    }

    // VIP 목록 조회
    const { data: vipList } = await supabase
        .from("md_vip_users")
        .select("*, user:users(id, display_name)")
        .eq("md_id", authUser.id)
        .order("created_at", { ascending: false });

    // 신뢰 점수 조회 (MD/admin 전용 RPC — 뷰 직접 접근은 Migration 340에서 차단됨)
    const { data: trustScores } = await supabase
        .rpc("get_trust_scores", { p_limit: 50 });

    return (
        <div className="max-w-lg mx-auto px-4 py-8">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/md/dashboard" className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border">
                    <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                </Link>
                <h1 className="text-xl font-black text-foreground flex items-center gap-2">
                    <span className="text-brand-amber">⭐</span> VIP 고객 관리
                </h1>
            </div>
            <VIPDashboard
                mdId={authUser.id}
                initialVipList={vipList || []}
                trustScores={trustScores || []}
            />
        </div>
    );
}
