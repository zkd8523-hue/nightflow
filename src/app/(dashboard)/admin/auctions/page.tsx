import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Gavel, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { AdminAuctionPageClient } from "@/components/admin/AdminAuctionPageClient";

export default async function AdminAuctionsPage() {
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

    // 2. 경매 목록 조회 (Club, MD 정보 포함)
    const { data: auctions } = await supabase
        .from("auctions")
        .select(`
      *,
      club:club_id (*),
      md:md_id (name)
    `)
        .order("created_at", { ascending: false });

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pt-12 pb-24">
            <div className="max-w-6xl mx-auto px-6 space-y-10">
                {/* Header */}
                <header className="space-y-2">
                    <div className="flex items-center gap-3">
                        <Link href="/admin" className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 hover:border-neutral-700 transition-colors">
                            <ChevronLeft className="w-5 h-5 text-neutral-400" />
                        </Link>
                        <div className="flex items-center gap-2 text-neutral-500 font-bold uppercase tracking-widest text-[11px]">
                            <Gavel className="w-3.5 h-3.5" />
                            Live Marketplace Ops
                        </div>
                    </div>
                    <h1 className="text-4xl font-black tracking-tighter">경매 관리</h1>
                    <p className="text-neutral-500 font-medium">경매 현황 모니터링 및 관리 작업을 수행합니다.</p>
                </header>

                {/* Client-side tabs */}
                <AdminAuctionPageClient auctions={auctions || []} />
            </div>
        </div>
    );
}
