import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuctionForm } from "@/components/md/AuctionForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface EditAuctionPageProps {
    params: Promise<{ id: string }>;
}

export default async function EditAuctionPage({ params }: EditAuctionPageProps) {
    const { id } = await params;
    const supabase = await createClient();

    // 1. 세션 및 MD 권한 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: userData } = await supabase
        .from("users")
        .select("role, default_club_id")
        .eq("id", user.id)
        .single();

    if (!userData || (userData.role !== "md" && userData.role !== "admin")) {
        redirect("/");
    }

    // 2. 경매 정보 데이터 조회
    const { data: auction } = await supabase
        .from("auctions")
        .select("*")
        .eq("id", id)
        .eq("md_id", user.id)
        .single();

    if (!auction) {
        redirect("/md/dashboard");
    }

    // 3. 선택 가능한 클럽 목록 조회 (본인 소속 클럽만)
    const { data: clubs } = await supabase
        .from("clubs")
        .select("*")
        .eq("md_id", user.id)
        .order("name");

    return (
        <div className="min-h-screen bg-[#0A0A0A] pb-20">
            <div className="max-w-lg mx-auto p-6 pt-12">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/md/dashboard" className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
                        <ChevronLeft className="w-5 h-5 text-neutral-400" />
                    </Link>
                    <div className="space-y-0.5">
                        <h1 className="text-2xl font-black text-white tracking-tight">경매 정보 수정</h1>
                        <p className="text-neutral-500 text-sm font-medium">등록된 경매 내용을 수정합니다.</p>
                    </div>
                </div>

                <AuctionForm
                    clubs={clubs || []}
                    mdId={user.id}
                    initialData={auction}
                    defaultClubId={userData.default_club_id}
                />
            </div>
        </div>
    );
}
