import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminMDPageClient } from "@/components/admin/AdminMDPageClient";
import type { MDHealthScore } from "@/types/database";

export default async function AdminMDPage() {
    const supabase = await createClient();

    // 1. 관리자 권한 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: userData } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

    if (userData?.role !== "admin") {
        redirect("/");
    }

    // 2. MD 신청 목록 및 통계 데이터 조회 (clubs JOIN 포함)
    const { data: allApplications } = await supabase
        .from("users")
        .select("*, default_club:clubs!default_club_id(*)")
        .not("md_status", "is", null)
        .order("created_at", { ascending: false });

    // 3. MD Health Scores 조회 (모니터링용)
    const { data: healthScores } = await supabase
        .from("md_health_scores")
        .select("*")
        .eq("md_status", "approved")
        .returns<MDHealthScore[]>();

    return (
        <AdminMDPageClient
            initialUsers={allApplications || []}
            healthScores={healthScores || undefined}
        />
    );
}
