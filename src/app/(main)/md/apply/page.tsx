import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MDApplyForm } from "@/components/md/MDApplyForm";

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

    // 이미 MD라면 대시보드로 이동
    if (userData.role === "md" && userData.md_status === "approved") {
        redirect("/md/dashboard");
    }

    // 3. 신청 폼 렌더링 (승인 대기 없이 즉시 활동 가능)
    return (
        <div className="min-h-screen bg-[#0A0A0A] pt-20 pb-24 px-4">
            <div className="max-w-lg mx-auto">
                <div className="space-y-10">
                    <div className="space-y-4">
                        <Badge className="bg-white/10 text-white/60 font-medium px-3 py-1 border border-white/10">PARTNER APPLY</Badge>
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
