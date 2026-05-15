import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminMDPageClient } from "@/components/admin/AdminMDPageClient";
import type { Club, MDHealthScore } from "@/types/database";

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

    // 2. MD 신청 목록 및 통계 데이터 조회
    //    Phase 3(Migration 177): owned_clubs 는 club_partners(N:N) 조인으로 가져온 뒤
    //    클라이언트가 기대하는 Club[] 형태로 평탄화한다.
    const { data: rawApplications } = await supabase
        .from("users")
        .select(
            "*, default_club:clubs!default_club_id(*), partner_links:club_partners(club:clubs(*))"
        )
        .not("md_status", "is", null)
        .order("created_at", { ascending: false });

    type PartnerLink = { club: Club | null };
    const allApplications = (rawApplications ?? []).map((u) => {
        const links = (u.partner_links ?? []) as PartnerLink[];
        const owned_clubs = links
            .map((l) => l.club)
            .filter((c): c is Club => c != null);
        return { ...u, owned_clubs };
    });

    // 3. MD Health Scores 조회 (모니터링용)
    const { data: healthScores } = await supabase
        .from("md_health_scores")
        .select("*")
        .eq("md_status", "approved")
        .returns<MDHealthScore[]>();

    return (
        <AdminMDPageClient
            initialUsers={allApplications}
            healthScores={healthScores || undefined}
        />
    );
}
