"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, CheckCircle2, Handshake, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics";

interface ConfirmVisitButtonProps {
    auctionId: string;
    auctionStatus?: string;
}

export function ConfirmVisitButton({ auctionId, auctionStatus = "won" }: ConfirmVisitButtonProps) {
    const [loading, setLoading] = useState(false);
    const [showConfirmVisit, setShowConfirmVisit] = useState(false);
    const [showFallbackSheet, setShowFallbackSheet] = useState(false);
    const [showNoShow, setShowNoShow] = useState(false);
    const [showMutualCancel, setShowMutualCancel] = useState(false);
    const router = useRouter();

    const isInstantActive = auctionStatus === "instant_active";

    // 방문 확인 (won → confirmed) 또는 거래완료 (instant active → confirmed)
    const handleConfirmVisit = async () => {
        setLoading(true);
        try {
            const endpoint = isInstantActive ? "/api/auction/complete" : "/api/auction/confirm";
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ auctionId }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "처리 중 오류가 발생했습니다.");
            }

            trackEvent(isInstantActive ? "instant_completed" : "visit_confirmed", { auction_id: auctionId });
            toast.success(isInstantActive ? "거래완료 처리되었습니다!" : "방문 확인 완료!");
            router.refresh();
        } catch (error: unknown) {
            logger.error("Confirm visit error:", error);
            toast.error(error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    // 노쇼 처리
    const handleNoShow = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/auction/noshow", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ auctionId }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "처리 중 오류가 발생했습니다.");
            }

            const result = await res.json();

            if (result.action === 'permanent_block') {
                toast.error("노쇼 처리 완료 (해당 유저는 영구 차단되었습니다)");
            } else if (result.bannedUntil) {
                const date = new Date(result.bannedUntil).toLocaleDateString();
                toast.error(`노쇼 처리 완료 (${date}까지 이용이 정지됩니다)`);
            } else {
                toast.warning(`노쇼 처리가 완료되었습니다. (현재 스트라이크: ${result.strikeCount}회)`);
            }
            router.refresh();
        } catch (error: unknown) {
            logger.error("NoShow error:", error);
            toast.error(error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    // 합의 취소 (MD-고객 상호 동의, 스트라이크 없음)
    const handleMutualCancel = async (reason: string) => {
        setLoading(true);
        try {
            const res = await fetch("/api/auction/mutual-cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ auctionId, reason }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "처리 중 오류가 발생했습니다.");
            }

            const result = await res.json();
            if (result.fallback?.result === "fallback_won") {
                toast.success("합의 취소 완료. 차순위 입찰자에게 낙찰이 전환되었습니다.");
            } else {
                toast.success("합의 취소가 완료되었습니다.");
            }
            router.refresh();
        } catch (error: unknown) {
            logger.error("Mutual cancel error:", error);
            toast.error(error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    // instant active: 거래완료 버튼만 표시
    if (isInstantActive) {
        return (
            <div className="space-y-2">
                <Button
                    onClick={handleConfirmVisit}
                    disabled={loading}
                    className="w-full h-12 bg-green-600 text-white font-bold hover:bg-green-700 rounded-xl flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    거래완료
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Primary action */}
            {auctionStatus === "won" && (
                <>
                    <Button
                        onClick={() => setShowConfirmVisit(true)}
                        disabled={loading}
                        className="w-full h-12 bg-green-600 text-white font-bold hover:bg-green-700 rounded-xl flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        방문 확인
                    </Button>
                    <ConfirmDialog
                        isOpen={showConfirmVisit}
                        onOpenChange={setShowConfirmVisit}
                        onConfirm={handleConfirmVisit}
                        title="방문 확인"
                        description="실제 방문을 확인하셨나요? 방문 확인 후에는 노쇼 신고가 불가합니다."
                        confirmText="방문 확인"
                        variant="default"
                    />
                </>
            )}

            {/* Secondary action: 차순위 넘기기 */}
            {auctionStatus === "won" && (
                <>
                    <Button
                        onClick={() => setShowFallbackSheet(true)}
                        disabled={loading}
                        variant="outline"
                        className="w-full h-10 border-neutral-700 bg-neutral-900 text-neutral-400 font-bold hover:bg-neutral-800 rounded-xl flex items-center justify-center gap-1.5 text-[13px]"
                    >
                        차순위 넘기기
                        <ChevronRight className="w-3.5 h-3.5" />
                    </Button>

                    {/* 차순위 넘기기 이유 선택 Sheet */}
                    <Sheet open={showFallbackSheet} onOpenChange={setShowFallbackSheet}>
                        <SheetContent side="bottom" className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl pb-10">
                            <SheetHeader className="mb-4">
                                <SheetTitle className="text-white text-base font-bold">차순위로 넘기는 이유를 선택해주세요</SheetTitle>
                            </SheetHeader>
                            <div className="space-y-3">
                                {/* 노쇼 */}
                                <button
                                    onClick={() => { setShowFallbackSheet(false); setShowNoShow(true); }}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                                            <AlertTriangle className="w-4 h-4 text-red-400" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-white font-bold text-sm">노쇼</p>
                                            <p className="text-neutral-500 text-xs">연락을 받지 못했습니다</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-neutral-600" />
                                </button>

                                {/* 합의 취소 */}
                                <button
                                    onClick={() => { setShowFallbackSheet(false); setShowMutualCancel(true); }}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                                            <Handshake className="w-4 h-4 text-amber-400" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-white font-bold text-sm">합의 취소</p>
                                            <p className="text-neutral-500 text-xs">고객과 협의했습니다 · 패널티 없음</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-neutral-600" />
                                </button>
                            </div>
                        </SheetContent>
                    </Sheet>

                    <ConfirmDialog
                        isOpen={showNoShow}
                        onOpenChange={setShowNoShow}
                        onConfirm={handleNoShow}
                        title="노쇼 처리"
                        description="낙찰자에게 스트라이크가 부과되고 차순위 입찰자에게 낙찰 제안이 전송됩니다."
                        confirmText="노쇼 처리"
                        variant="danger"
                    />

                    <PromptDialog
                        isOpen={showMutualCancel}
                        onOpenChange={setShowMutualCancel}
                        onConfirm={handleMutualCancel}
                        title="합의 취소"
                        description="고객과 합의하여 경매를 취소합니다. 양측 모두 패널티가 부과되지 않습니다."
                        placeholder="취소 사유를 입력하세요 (필수)"
                        confirmText="합의 취소"
                    />
                </>
            )}
        </div>
    );
}
