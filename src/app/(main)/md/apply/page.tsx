import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MDApplyForm } from "@/components/md/MDApplyForm";
import { MDPendingStatus } from "@/components/md/MDPendingStatus";

export default async function MDApplyPage() {
    const supabase = await createClient();

    // 1. 세션 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // 2. 유저 데이터 확인
    const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

    if (!userData) return null;

    // 이미 승인된 MD라면 대시보드로 이동
    if (userData.role === "md" && userData.md_status === "approved") {
        redirect("/md/dashboard");
    }

    // pending 상태: 심사 중 / 인증코드 입력 UI
    if (userData.md_status === "pending") {
        return (
            <div className="min-h-screen bg-[#0A0A0A] pt-20 pb-24 px-4">
                <div className="max-w-lg mx-auto">
                    <MDPendingStatus user={userData} />
                </div>
            </div>
        );
    }

    // rejected 상태: 재신청 안내 + 폼
    // 신규 신청 또는 재신청
    return (
        <div className="min-h-screen bg-[#0A0A0A] pt-20 pb-24 px-4">
            <div className="max-w-lg mx-auto">
                <div className="space-y-10">
                    {userData.md_status === "rejected" && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                            <p className="text-red-400 text-[13px] font-bold">이전 신청이 반려되었습니다.</p>
                            {userData.md_rejection_reason && (
                                <p className="text-neutral-400 text-[12px] mt-1">사유: {userData.md_rejection_reason}</p>
                            )}
                            <p className="text-neutral-500 text-[12px] mt-2">아래에서 다시 신청할 수 있습니다.</p>
                        </div>
                    )}
                    <div className="space-y-4">
                        <Badge className="bg-white/10 text-white/60 font-medium px-3 py-1 border border-white/10">MD 파트너 등록</Badge>
                        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight leading-tight">
                            빈 테이블, 10초 만에<br />수익으로 전환하세요
                        </h1>
                    </div>

                    <MDApplyForm initialUser={userData} />
                </div>
            </div>
        </div>
    );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <span className={`inline-block rounded-full text-[10px] tracking-widest ${className}`}>
            {children}
        </span>
    );
}
