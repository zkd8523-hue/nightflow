import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuctionForm } from "@/components/md/AuctionForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { isInstantEnabled } from "@/lib/features";

export default async function NewAuctionPage({ searchParams }: { searchParams: Promise<{ repost?: string }> }) {
    const supabase = await createClient();
    const params = await searchParams;

    // 1. 세션 및 MD 권한 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: userData } = await supabase
        .from("users")
        .select("role, md_status, default_club_id")
        .eq("id", user.id)
        .single();

    if (!userData || (userData.role !== "md" && userData.role !== "admin")) {
        redirect("/");
    }

    // 제재 상태면 경매 등록 차단 (suspended/revoked)
    if (userData.role === "md" && userData.md_status !== "approved") {
        const isRevoked = userData.md_status === "revoked";

        return (
            <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
                <div className="max-w-md mx-auto p-6 text-center space-y-4">
                    <p className="text-4xl">
                        {isRevoked ? "\uD83D\uDEAB" : "\u23F8\uFE0F"}
                    </p>
                    <h1 className="text-xl font-bold text-white">
                        {isRevoked ? "MD 자격 박탈" : "활동 정지 중"}
                    </h1>
                    <p className="text-neutral-400 text-sm">
                        {isRevoked
                            ? "MD 자격이 박탈되었습니다. 문의사항은 관리자에게 연락해주세요."
                            : "운영 정책 위반으로 활동이 일시 정지되었습니다."}
                    </p>
                    <Link href={isRevoked ? "/" : "/md/dashboard"} className="inline-block mt-4 px-6 py-3 bg-white text-black font-bold rounded-xl">
                        {isRevoked ? "홈으로 돌아가기" : "대시보드로 돌아가기"}
                    </Link>
                </div>
            </div>
        );
    }

    // 2. 선택 가능한 클럽 목록 조회 (본인 소속 클럽만) + 상태별 필터링
    const { data: allClubs } = await supabase
        .from("clubs")
        .select("*")
        .eq("md_id", user.id)
        .order("name");

    const approvedClubs = allClubs || [];

    // 클럽 없음 → 신청 유도
    if (approvedClubs.length === 0) {
        return (
            <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
                <div className="max-w-md mx-auto p-6 text-center space-y-6">
                    <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto">
                        <span className="text-3xl">🏢</span>
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-xl font-bold text-white">등록된 클럽이 없습니다</h1>
                        <p className="text-neutral-400 text-sm leading-relaxed">
                            경매를 등록하려면 관리자에게 클럽 등록을 요청해주세요.
                        </p>
                    </div>
                    <Link
                        href="/md/dashboard"
                        className="inline-block px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors"
                    >
                        대시보드로 돌아가기
                    </Link>
                </div>
            </div>
        );
    }

    // 4. 재등록 시 원본 경매 데이터 조회
    let repostFrom = null;
    if (params.repost) {
        const { data } = await supabase
            .from("auctions")
            .select("*")
            .eq("id", params.repost)
            .eq("md_id", user.id)
            .single();
        if (data) repostFrom = data;
    }

    return (
        <div className="min-h-screen bg-[#0A0A0A] pb-20">
            <div className="max-w-lg mx-auto p-6 pt-12">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/md/dashboard" className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
                        <ChevronLeft className="w-5 h-5 text-neutral-400" />
                    </Link>
                    <div className="space-y-0.5">
                        <h1 className="text-2xl font-black text-white tracking-tight">
                            {repostFrom ? "경매 재등록" : "새 경매 등록"}
                        </h1>
                        <p className="text-neutral-500 text-sm font-medium">
                            {repostFrom
                                ? "유찰된 경매를 다시 등록합니다. 가격을 조정해보세요."
                                : isInstantEnabled()
                                    ? "오늘 밤 주인공이 될 테이블을 올려주세요."
                                    : "다음 주말 테이블을 미리 올려 입찰 경쟁을 받아보세요."}
                        </p>
                    </div>
                </div>

                <AuctionForm
                    clubs={approvedClubs}
                    mdId={user.id}
                    repostFrom={repostFrom}
                    defaultClubId={userData.default_club_id}
                />
            </div>
        </div>
    );
}
