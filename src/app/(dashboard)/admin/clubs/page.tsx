import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminClubsList } from "@/components/admin/AdminClubsList";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import type { MDHealthScore } from "@/types/database";

export default async function AdminClubsPage() {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) redirect("/login");

    const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

    if (!user || user.role !== "admin") {
        redirect("/");
    }

    // Phase 4(Migration 182): clubs.md_id 제거 — club_partners 단독 기반.
    const [{ data: clubs }, { data: healthScores }] = await Promise.all([
        supabase
            .from("clubs")
            .select(
                "*, partners:club_partners(md_id, role, user:users!club_partners_md_id_fkey(id, name, display_name, phone, profile_image, md_status, area, instagram, business_card_url, verification_club_name, created_at))"
            )
            .order("created_at", { ascending: false }),
        supabase
            .from("md_health_scores")
            .select("*")
            .returns<MDHealthScore[]>(),
    ]);

    const clubIds = (clubs ?? []).map((c) => c.id);
    type DefaultMdRow = { id: string; name: string | null; display_name: string | null; phone: string | null; default_club_id: string | null };
    const { data: defaultClubMds } = clubIds.length
        ? await supabase.from("users").select("id, name, display_name, phone, default_club_id").in("default_club_id", clubIds)
        : { data: [] as DefaultMdRow[] };

    const pickName = (name?: string | null, displayName?: string | null, phone?: string | null) =>
        (name && name.trim()) || (displayName && displayName.trim()) || phone || "이름없음";

    type MdChip = { id: string; name: string };
    type PartnerRow = {
        md_id: string;
        role: string;
        user: { id: string; name: string | null; display_name: string | null; phone: string | null } | null;
    };
    const clubMdLists: Record<string, MdChip[]> = {};
    for (const club of clubs ?? []) {
        const list: MdChip[] = [];
        const seen = new Set<string>();
        // 1) club_partners 기반 MD 목록
        const partners = (club.partners ?? []) as PartnerRow[];
        for (const p of partners) {
            if (seen.has(p.md_id)) continue;
            list.push({
                id: p.md_id,
                name: pickName(p.user?.name, p.user?.display_name, p.user?.phone),
            });
            seen.add(p.md_id);
        }
        // 2) default_club_id 로 이 클럽을 쓰는 MD (partner 미연결 케이스 보강)
        for (const row of (defaultClubMds ?? []) as DefaultMdRow[]) {
            if (row.default_club_id !== club.id) continue;
            if (seen.has(row.id)) continue;
            list.push({ id: row.id, name: pickName(row.name, row.display_name, row.phone) });
            seen.add(row.id);
        }
        clubMdLists[club.id] = list;
    }

    return (
        <div className="max-w-2xl mx-auto px-6 py-8">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/" className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
                    <ChevronLeft className="w-5 h-5 text-neutral-400" />
                </Link>
                <h1 className="text-xl font-black text-white">클럽 관리</h1>
            </div>
            <AdminClubsList initialClubs={clubs || []} authUserId={authUser.id} healthScores={healthScores || []} clubMdLists={clubMdLists} />
        </div>
    );
}
