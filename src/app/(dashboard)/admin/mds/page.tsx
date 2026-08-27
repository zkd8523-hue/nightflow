import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AdminMDPageClient } from "@/components/admin/AdminMDPageClient";
import type { Club, MDHealthScore, DjClaim } from "@/types/database";

export default async function AdminMDPage() {
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

    // 2. MD 신청 목록 및 통계 데이터 조회
    //    Phase 3(Migration 177): owned_clubs 는 club_partners(N:N) 조인으로 가져온 뒤
    //    클라이언트가 기대하는 Club[] 형태로 평탄화한다.
    //    DJ 인증 신청(dj_claims)은 병렬로 함께 조회한다 — MD 심사와 성격이 같은
    //    운영자 업무라 화면을 통합했다(직렬로 붙이면 화면이 느려진다).
    const [{ data: rawApplications }, { data: rawDjClaims }] = await Promise.all([
        supabase
            .from("users")
            .select(
                "*, default_club:clubs!default_club_id(*), partner_links:club_partners(club:clubs(*))"
            )
            .not("md_status", "is", null)
            .order("created_at", { ascending: false }),
        supabase
            .from("dj_claims")
            .select("*, dj:djs(id, display_name, slug, instagram), claimant:users!claimant_id(display_name, name, instagram)")
            .order("created_at", { ascending: false })
            .limit(200),
    ]);

    type PartnerLink = { club: Club | null };
    const allApplications = (rawApplications ?? []).map((u) => {
        const links = (u.partner_links ?? []) as PartnerLink[];
        const owned_clubs = links
            .map((l) => l.club)
            .filter((c): c is Club => c != null);
        return { ...u, owned_clubs };
    });

    // dj_id가 nullable이라 PostgREST 조인이 배열/객체 양쪽으로 올 수 있다(라인업 화면 공통 규약)
    const djClaims: DjClaim[] = (rawDjClaims ?? []).map((c) => ({
        ...c,
        dj: Array.isArray(c.dj) ? c.dj[0] ?? null : c.dj,
        claimant: Array.isArray(c.claimant) ? c.claimant[0] ?? null : c.claimant,
    })) as DjClaim[];

    // 3. MD Health Scores 조회 (모니터링용)
    const { data: healthScores } = await supabase
        .from("md_health_scores")
        .select("*")
        .eq("md_status", "approved")
        .returns<MDHealthScore[]>();

    // md_unique_slug 별도 매핑 (md_health_scores view에 없는 컬럼)
    let healthScoresWithSlug: MDHealthScore[] = (healthScores ?? []) as MDHealthScore[];
    try {
        const mdIds = (healthScores ?? []).map((h) => h.md_id).filter(Boolean);
        if (mdIds.length > 0) {
            const { data: slugs } = await supabase
                .from("users")
                .select("id, md_unique_slug")
                .in("id", mdIds);
            const slugMap = Object.fromEntries(
                ((slugs ?? []) as Array<{ id: string; md_unique_slug: string | null }>)
                    .filter((s) => s.md_unique_slug)
                    .map((s) => [s.id, s.md_unique_slug as string])
            );
            healthScoresWithSlug = (healthScores ?? []).map((h) => ({
                ...h,
                md_unique_slug: slugMap[h.md_id] ?? null,
            })) as unknown as MDHealthScore[];
        }
    } catch (err) {
        console.error("[admin/mds] slug map failed", err);
    }

    return (
        <AdminMDPageClient
            initialUsers={allApplications}
            healthScores={healthScoresWithSlug}
            initialDjClaims={djClaims}
        />
    );
}
