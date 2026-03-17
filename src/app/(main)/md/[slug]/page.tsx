import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { AuctionCard } from "@/components/auctions/AuctionCard";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";

export default async function MDPublicProfilePage({
    params
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params;
    const supabase = await createClient();

    // 1. MD 정보 조회
    const { data: mdUser } = await supabase
        .from("users")
        .select("*")
        .eq("md_unique_slug", slug)
        .single();

    if (!mdUser) {
        notFound();
    }

    // 2. MD 추천인 쿠키 설정 (7일 유지)
    const cookieStore = await cookies();
    cookieStore.set("md_referrer", mdUser.id, {
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    });

    // 2. 해당 MD의 활성 경매 조회
    const { data: auctions } = await supabase
        .from("auctions")
        .select(`
      *,
      club:club_id (*)
    `)
        .eq("md_id", mdUser.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });

    return (
        <div className="min-h-screen bg-[#0A0A0A] pb-20">
            {/* Profile Header */}
            <div className="bg-gradient-to-b from-neutral-900 to-[#0A0A0A] pt-16 pb-12 px-6 text-center">
                <div className="w-24 h-24 bg-neutral-800 rounded-full mx-auto mb-6 flex items-center justify-center border-4 border-[#1C1C1E] shadow-2xl overflow-hidden">
                    {mdUser.profile_image ? (
                        <img src={mdUser.profile_image} alt={mdUser.name} className="w-full h-full object-cover" />
                    ) : (
                        <User className="w-10 h-10 text-neutral-600" />
                    )}
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2">
                        <h1 className="text-2xl font-black text-white">{mdUser.name} MD</h1>
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-bold px-2 py-0.5 h-auto text-[10px]">
                            CERTIFIED
                        </Badge>
                    </div>
                    <p className="text-neutral-500 text-sm font-medium">NightFlow 공식 인증 MD</p>
                </div>

                <div className="mt-8 flex justify-center gap-4">
                    <div className="bg-[#1C1C1E] px-6 py-3 rounded-2xl border border-neutral-800/50">
                        <p className="text-[10px] text-neutral-500 font-bold uppercase mb-1">진행 중</p>
                        <p className="text-xl font-black text-white">{auctions?.length || 0}건</p>
                    </div>
                    <div className="bg-[#1C1C1E] px-6 py-3 rounded-2xl border border-neutral-800/50">
                        <p className="text-[10px] text-neutral-500 font-bold uppercase mb-1">인기도</p>
                        <p className="text-xl font-black text-white">TOP</p>
                    </div>
                </div>
            </div>

            {/* Active Auctions Section */}
            <div className="max-w-lg mx-auto px-4 mt-8 space-y-6">
                <div className="flex items-center justify-between px-2">
                    <h2 className="text-lg font-bold text-white tracking-tight">현재 진행 중인 경매</h2>
                    <span className="text-[12px] text-neutral-500 font-medium">최신순</span>
                </div>

                <div className="space-y-4">
                    {auctions && auctions.length > 0 ? (
                        auctions.map(auction => (
                            <AuctionCard key={auction.id} auction={auction} />
                        ))
                    ) : (
                        <div className="py-20 text-center bg-[#1C1C1E]/30 rounded-3xl border border-dashed border-neutral-800/50">
                            <p className="text-neutral-500 font-medium text-sm italic">현재 진행 중인 경매가 없습니다.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
