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

    // 3. 조각 참여 클릭 집계 (Migration 269 share_join_click_stats 뷰)
    const { data: clickStats } = await supabase
        .from("share_join_click_stats")
        .select("auction_id, total_clicks, success_clicks, unique_clickers");

    const clickMap: Record<string, { total: number; success: number; unique: number }> = {};
    for (const s of (clickStats ?? []) as Array<{
        auction_id: string;
        total_clicks: number;
        success_clicks: number;
        unique_clickers: number;
    }>) {
        clickMap[s.auction_id] = {
            total: s.total_clicks ?? 0,
            success: s.success_clicks ?? 0,
            unique: s.unique_clickers ?? 0,
        };
    }

    const auctionsWithClicks = (auctions ?? []).map((a) => ({
        ...a,
        click_total: clickMap[a.id]?.total ?? 0,
        click_success: clickMap[a.id]?.success ?? 0,
        click_unique: clickMap[a.id]?.unique ?? 0,
    }));

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
                    <h1 className="text-4xl font-black tracking-tighter">퍼즐 관리</h1>
                    <p className="text-neutral-500 font-medium">퍼즐 현황 모니터링 및 관리 작업을 수행합니다.</p>
                </header>

                {/* Client-side tabs */}
                <AdminAuctionPageClient auctions={auctionsWithClicks} />
            </div>
        </div>
    );
}
