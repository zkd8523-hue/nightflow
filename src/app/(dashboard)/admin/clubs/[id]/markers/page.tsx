import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AdminMarkersClient } from "./AdminMarkersClient";

interface Props {
    params: Promise<{ id: string }>;
}

export default async function AdminClubMarkersPage({ params }: Props) {
    const { id } = await params;
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

    const { data: club } = await supabase
        .from("clubs")
        .select("*")
        .eq("id", id)
        .single();

    if (!club) {
        redirect("/admin/clubs");
    }

    return (
        <div className="max-w-4xl mx-auto px-6 py-8">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/admin/clubs" className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
                    <ChevronLeft className="w-5 h-5 text-neutral-400" />
                </Link>
                <div>
                    <h1 className="text-xl font-black text-white">{club.name} — 테이블 설정</h1>
                    <p className="text-xs text-neutral-500 mt-0.5">{club.area} · {club.address}</p>
                </div>
            </div>

            {!club.floor_plan_url ? (
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto">
                        <span className="text-3xl">🗺️</span>
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-lg">플로어맵 이미지가 필요합니다</h3>
                        <p className="text-neutral-500 text-sm mt-2">
                            먼저 MD가 클럽 설정에서 플로어맵 이미지를 업로드해야 합니다.<br />
                            그 후 이 페이지에서 테이블 마커를 배치할 수 있습니다.
                        </p>
                    </div>
                </div>
            ) : (
                <AdminMarkersClient
                    clubId={club.id}
                    clubName={club.name}
                    floorPlanUrl={club.floor_plan_url}
                    initialPositions={club.table_positions || []}
                />
            )}
        </div>
    );
}
