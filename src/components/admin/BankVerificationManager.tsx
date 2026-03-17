"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import {
    ShieldCheck,
    ShieldAlert,
    CheckCircle,
    XCircle,
    Loader2,
    AlertTriangle,
} from "lucide-react";
import dayjs from "dayjs";
import { getErrorMessage, logError } from "@/lib/utils/error";

interface BankVerification {
    id: string;
    md_id: string;
    bank_name: string;
    bank_account: string;
    account_holder: string;
    verification_status: "pending" | "verified" | "rejected";
    rejection_reason: string | null;
    verified_at: string | null;
    created_at: string;
    md?: {
        id: string;
        name: string;
        phone?: string;
        email?: string;
    };
    verifier?: {
        name: string;
    };
}

interface Props {
    pendingVerifications: BankVerification[];
    recentVerifications: BankVerification[];
    adminId: string;
}

export function BankVerificationManager({
    pendingVerifications,
    recentVerifications,
    adminId,
}: Props) {
    const supabase = createClient();
    const [selectedVerification, setSelectedVerification] = useState<BankVerification | null>(null);
    const [rejectionReason, setRejectionReason] = useState("");
    const [loading, setLoading] = useState(false);

    const handleVerify = async (approved: boolean) => {
        if (!selectedVerification) return;

        if (!approved && !rejectionReason.trim()) {
            toast.error("거부 사유를 입력해주세요");
            return;
        }

        setLoading(true);
        try {
            // 1. bank_verifications 업데이트
            const { error: verificationError } = await supabase
                .from("bank_verifications")
                .update({
                    verification_status: approved ? "verified" : "rejected",
                    verified_by: adminId,
                    verified_at: new Date().toISOString(),
                    rejection_reason: approved ? null : rejectionReason.trim(),
                })
                .eq("id", selectedVerification.id);

            if (verificationError) throw verificationError;

            // 2. users 테이블의 bank_verified 업데이트
            if (approved) {
                const { error: userError } = await supabase
                    .from("users")
                    .update({ bank_verified: true })
                    .eq("id", selectedVerification.md_id);

                if (userError) throw userError;
            }

            toast.success(
                approved
                    ? `${selectedVerification.md?.name}님의 계좌가 승인되었습니다`
                    : `${selectedVerification.md?.name}님의 계좌가 거부되었습니다`
            );

            setSelectedVerification(null);
            setRejectionReason("");
            window.location.reload();
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            logError(error, 'BankVerificationManager.handleVerify');
            toast.error(msg || "처리 중 오류가 발생했습니다");
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        if (status === "verified") {
            return (
                <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-xs font-bold">
                    <CheckCircle className="w-3 h-3 mr-1" /> 승인
                </Badge>
            );
        }
        if (status === "rejected") {
            return (
                <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-xs font-bold">
                    <XCircle className="w-3 h-3 mr-1" /> 거부
                </Badge>
            );
        }
        return (
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs font-bold">
                <ShieldAlert className="w-3 h-3 mr-1" /> 대기
            </Badge>
        );
    };

    return (
        <div className="space-y-8">
            {/* 검증 대기 통계 */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5">
                    <p className="text-neutral-500 text-sm font-bold mb-1">검증 대기</p>
                    <p className="text-3xl font-black text-amber-500">{pendingVerifications.length}건</p>
                </div>
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5">
                    <p className="text-neutral-500 text-sm font-bold mb-1">처리 완료</p>
                    <p className="text-3xl font-black text-green-500">{recentVerifications.length}건</p>
                </div>
            </div>

            {/* 검증 대기 목록 */}
            <div>
                <h2 className="text-xl font-black text-white mb-4">검증 대기 중</h2>
                {pendingVerifications.length === 0 ? (
                    <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-12 text-center">
                        <p className="text-neutral-500">검증 대기 중인 요청이 없습니다</p>
                    </div>
                ) : (
                    <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-800">
                                    <th className="text-left p-4 text-sm font-bold text-neutral-400">MD</th>
                                    <th className="text-left p-4 text-sm font-bold text-neutral-400">예금주</th>
                                    <th className="text-left p-4 text-sm font-bold text-neutral-400">은행</th>
                                    <th className="text-left p-4 text-sm font-bold text-neutral-400">계좌번호</th>
                                    <th className="text-left p-4 text-sm font-bold text-neutral-400">요청일</th>
                                    <th className="text-center p-4 text-sm font-bold text-neutral-400">액션</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingVerifications.map((v) => (
                                    <tr
                                        key={v.id}
                                        className="border-b border-neutral-800/50 hover:bg-neutral-900/50 transition-colors"
                                    >
                                        <td className="p-4">
                                            <div>
                                                <p className="font-bold text-white">{v.md?.name || "-"}</p>
                                                <p className="text-xs text-neutral-500">{v.md?.phone || v.md?.email || "-"}</p>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-sm font-bold text-white">{v.account_holder}</span>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-sm font-medium text-white">{v.bank_name}</span>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-sm font-mono text-neutral-400">{v.bank_account}</span>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-xs text-neutral-500">
                                                {dayjs(v.created_at).format("YYYY-MM-DD HH:mm")}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <Button
                                                size="sm"
                                                onClick={() => setSelectedVerification(v)}
                                                className="text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold"
                                            >
                                                <ShieldCheck className="w-3 h-3 mr-1" />
                                                검증
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 최근 처리 이력 */}
            <div>
                <h2 className="text-xl font-black text-white mb-4">최근 처리 이력</h2>
                {recentVerifications.length === 0 ? (
                    <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-12 text-center">
                        <p className="text-neutral-500">처리 이력이 없습니다</p>
                    </div>
                ) : (
                    <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-800">
                                    <th className="text-left p-4 text-sm font-bold text-neutral-400">MD</th>
                                    <th className="text-left p-4 text-sm font-bold text-neutral-400">은행 정보</th>
                                    <th className="text-center p-4 text-sm font-bold text-neutral-400">상태</th>
                                    <th className="text-left p-4 text-sm font-bold text-neutral-400">처리자</th>
                                    <th className="text-left p-4 text-sm font-bold text-neutral-400">처리일</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentVerifications.map((v) => (
                                    <tr
                                        key={v.id}
                                        className="border-b border-neutral-800/50 hover:bg-neutral-900/50 transition-colors"
                                    >
                                        <td className="p-4">
                                            <span className="font-bold text-white">{v.md?.name || "-"}</span>
                                        </td>
                                        <td className="p-4">
                                            <div>
                                                <p className="text-sm text-white">{v.bank_name}</p>
                                                <p className="text-xs text-neutral-500 font-mono">{v.bank_account}</p>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">{getStatusBadge(v.verification_status)}</td>
                                        <td className="p-4">
                                            <span className="text-sm text-neutral-400">{v.verifier?.name || "-"}</span>
                                        </td>
                                        <td className="p-4">
                                            <div>
                                                <p className="text-xs text-neutral-400">
                                                    {v.verified_at ? dayjs(v.verified_at).format("YYYY-MM-DD HH:mm") : "-"}
                                                </p>
                                                {v.rejection_reason && (
                                                    <p className="text-xs text-red-500 mt-0.5">{v.rejection_reason}</p>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 검증 처리 Sheet */}
            <Sheet open={!!selectedVerification} onOpenChange={(open) => !open && setSelectedVerification(null)}>
                <SheetContent side="bottom" className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl">
                    <SheetHeader className="text-left">
                        <SheetTitle className="text-white font-black text-xl">계좌 검증</SheetTitle>
                        <SheetDescription className="text-neutral-400">
                            {selectedVerification?.md?.name}님의 계좌 정보를 확인하고 승인/거부합니다
                        </SheetDescription>
                    </SheetHeader>
                    {selectedVerification && (
                        <div className="space-y-4 mt-6">
                            <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-3 border border-neutral-800/50">
                                <div className="flex justify-between items-center">
                                    <span className="text-neutral-500 text-sm font-bold">MD</span>
                                    <span className="font-bold text-white">{selectedVerification.md?.name}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-neutral-500 text-sm font-bold">예금주명</span>
                                    <span className="font-bold text-white">{selectedVerification.account_holder}</span>
                                </div>
                                <div className="h-px bg-neutral-800" />
                                <div className="flex justify-between items-center">
                                    <span className="text-neutral-500 text-sm font-bold">은행</span>
                                    <span className="font-bold text-white">{selectedVerification.bank_name}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-neutral-500 text-sm font-bold">계좌번호</span>
                                    <span className="font-mono text-white">{selectedVerification.bank_account}</span>
                                </div>
                            </div>

                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                <div className="text-[13px] text-amber-400 font-medium leading-relaxed">
                                    <p className="font-bold mb-1">검증 시 확인 사항:</p>
                                    <ul className="list-disc list-inside space-y-0.5">
                                        <li>예금주명이 MD 본인 이름과 일치하는지 확인</li>
                                        <li>계좌번호 형식이 올바른지 확인</li>
                                        <li>실제 계좌 존재 여부 확인 (가능 시)</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <p className="text-sm font-bold text-neutral-400">거부 사유 (거부 시 필수)</p>
                                <Textarea
                                    placeholder="예: 예금주명 불일치, 계좌번호 오류 등"
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    className="bg-neutral-900 border-neutral-800 text-white min-h-[80px]"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3 pb-8">
                                <Button
                                    variant="outline"
                                    onClick={() => handleVerify(false)}
                                    disabled={loading}
                                    className="h-14 rounded-2xl border-red-500/50 text-red-500 font-bold hover:bg-red-500/10"
                                >
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            <XCircle className="w-5 h-5 mr-2" />
                                            거부
                                        </>
                                    )}
                                </Button>
                                <Button
                                    onClick={() => handleVerify(true)}
                                    disabled={loading}
                                    className="h-14 rounded-2xl font-black text-lg bg-green-500 hover:bg-green-400 text-black"
                                >
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            <CheckCircle className="w-5 h-5 mr-2" />
                                            승인
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
