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

    // 2. 경매 정보 데이터 조회 (admin은 모든 경매, 그 외엔 본인 경매만)
    const isAdmin = userData.role === "admin";
    const { data: auction } = await supabase
        .from("auctions")
        .select("*")
        .eq("id", id)
        .single();

    if (!auction) {
        redirect("/md/dashboard");
    }
    if (!isAdmin && auction.md_id !== user.id) {
        redirect("/md/dashboard");
    }

    // 3. 클럽 목록: 경매 owner의 클럽 로드 (Migration 177: club_partners 기반)
    //    admin이 남의 경매 수정 시에도 owner(md_id)의 partner 클럽 풀을 사용.
    const { data: clubs } = await supabase
        .from("clubs")
        .select("*, club_partners!inner(md_id)")
        .eq("club_partners.md_id", auction.md_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

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
                    mdId={auction.md_id}
                    initialData={auction}
                    defaultClubId={userData.default_club_id}
                />
            </div>
        </div>
    );
}
