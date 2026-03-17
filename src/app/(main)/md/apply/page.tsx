import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MDApplyForm } from "@/components/md/MDApplyForm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Clock, CheckCircle2, AlertCircle } from "lucide-react";

export default async function MDApplyPage() {
    const supabase = await createClient();

    // 1. 세션 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // 2. 유저 데이터 및 MD 상태 확인
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

    // 3. 상태별 동적 화면 렌더링
    return (
        <div className="min-h-screen bg-[#0A0A0A] pt-20 pb-24 px-4">
            <div className="max-w-lg mx-auto">
                {userData.md_status === "pending" ? (
                    /* 신청 완료 및 심사 대기 상태 */
                    <div className="text-center space-y-8 py-12">
                        <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto border border-amber-500/20">
                            <Clock className="w-10 h-10 text-amber-500 animate-pulse" />
                        </div>
                        <div className="space-y-3">
                            <h1 className="text-3xl font-black text-white tracking-tight">파트너 심사 중</h1>
                            <p className="text-neutral-500 font-medium leading-relaxed">
                                신청하신 소중한 정보를 검토하고 있습니다.<br />
                                승인 결과는 24시간 내에 반영됩니다.
                            </p>
                        </div>
                        <Card className="bg-[#1C1C1E] border-neutral-800 p-6 text-left space-y-4">
                            <div className="flex items-start gap-3">
                                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                                <div>
                                    <p className="text-white font-bold text-sm">신청 접수 완료</p>
                                    <p className="text-neutral-500 text-xs">정상적으로 접수되었습니다.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 opacity-50">
                                <Clock className="w-5 h-5 text-neutral-500 mt-0.5" />
                                <div>
                                    <p className="text-white font-bold text-sm">전문 MD 인터뷰</p>
                                    <p className="text-neutral-500 text-xs">필요 시 유선으로 연락드립니다.</p>
                                </div>
                            </div>
                        </Card>
                        <Link href="/" className="block">
                            <Button variant="ghost" className="text-neutral-500 font-bold">
                                메인으로 돌아가기
                            </Button>
                        </Link>
                    </div>
                ) : (
                    /* 신청 폼 (최초 신청 또는 재신청) */
                    <div className="space-y-10">
                        {userData.md_status === "rejected" && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <AlertCircle className="w-4 h-4 text-red-500" />
                                    <span className="text-red-400 font-bold text-sm">이전 신청이 반려되었습니다</span>
                                </div>
                                <p className="text-neutral-500 text-xs">
                                    사유: {userData.md_rejection_reason || "정보 불일치 또는 자격 요건 미달"}
                                </p>
                                <p className="text-neutral-600 text-[10px] mt-1">정보를 수정하고 다시 신청해주세요.</p>
                            </div>
                        )}
                        <div className="space-y-4">
                            <Badge className="bg-white/10 text-white/60 font-medium px-3 py-1 border border-white/10">PARTNER APPLY</Badge>
                            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight leading-tight">
                                빈 테이블, 10초 만에<br />수익으로 전환하세요
                            </h1>
                        </div>

                        <MDApplyForm initialUser={userData} />
                    </div>
                )}
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
