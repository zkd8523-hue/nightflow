import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminClubsList } from "@/components/admin/AdminClubsList";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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

    const [{ data: clubs }, { data: healthScores }] = await Promise.all([
        supabase
            .from("clubs")
            .select("*, md:users!clubs_md_id_fkey(id, name, display_name, phone, profile_image, md_status, area, instagram, business_card_url, verification_club_name, created_at)")
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
    const clubMdLists: Record<string, MdChip[]> = {};
    for (const club of clubs ?? []) {
        const list: MdChip[] = [];
        const seen = new Set<string>();
        if (club.md_id) {
            const ownerMd = club.md as { name?: string | null; display_name?: string | null; phone?: string | null } | null | undefined;
            list.push({
                id: club.md_id,
                name: pickName(ownerMd?.name, ownerMd?.display_name, ownerMd?.phone),
            });
            seen.add(club.md_id);
        }
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
