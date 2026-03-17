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
            .select("*, md:users!clubs_md_id_fkey(id, name, phone, profile_image, md_status, area, instagram, business_card_url, verification_club_name, created_at)")
            .order("created_at", { ascending: false }),
        supabase
            .from("md_health_scores")
            .select("*")
            .returns<MDHealthScore[]>(),
    ]);

    return (
        <div className="max-w-2xl mx-auto px-6 py-8">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/" className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
                    <ChevronLeft className="w-5 h-5 text-neutral-400" />
                </Link>
                <h1 className="text-xl font-black text-white">클럽 신청 관리</h1>
            </div>
            <AdminClubsList initialClubs={clubs || []} authUserId={authUser.id} healthScores={healthScores || []} />
        </div>
    );
}
