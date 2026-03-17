"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, CheckCircle2, Handshake } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics";

interface ConfirmVisitButtonProps {
    auctionId: string;
    auctionStatus?: string;
}

export function ConfirmVisitButton({ auctionId, auctionStatus = "won" }: ConfirmVisitButtonProps) {
    const [loading, setLoading] = useState(false);
    const [showNoShow, setShowNoShow] = useState(false);
    const [showMutualCancel, setShowMutualCancel] = useState(false);
    const router = useRouter();

    // 방문 확인 (contacted → confirmed)
    const handleConfirmVisit = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/auction/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ auctionId }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "처리 중 오류가 발생했습니다.");
            }

            trackEvent("visit_confirmed", { auction_id: auctionId });
            toast.success("방문 확인 완료!");
            router.refresh();
        } catch (error: unknown) {
            logger.error("Confirm visit error:", error);
            toast.error(error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    // 노쇼 신고
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

    return (
        <div className="space-y-2">
            {/* Primary action: contacted 상태에서만 방문 확인 */}
            {auctionStatus === "contacted" && (
                <Button
                    onClick={handleConfirmVisit}
                    disabled={loading}
                    className="w-full h-12 bg-green-600 text-white font-bold hover:bg-green-700 rounded-xl flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    방문 확인
                </Button>
            )}

            {/* Secondary actions: 노쇼 신고 + 합의 취소 (가로 배치) */}
            {["won", "contacted"].includes(auctionStatus) && (
                <>
                    <div className="flex gap-2">
                        <Button
                            onClick={() => setShowNoShow(true)}
                            disabled={loading}
                            variant="outline"
                            className="flex-1 h-10 border-red-500/30 bg-red-500/5 text-red-500 font-bold hover:bg-red-500/10 rounded-xl flex items-center justify-center gap-1.5 text-[13px]"
                        >
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                            노쇼 신고
                        </Button>

                        <Button
                            onClick={() => setShowMutualCancel(true)}
                            disabled={loading}
                            variant="outline"
                            className="flex-1 h-10 border-amber-500/30 bg-amber-500/5 text-amber-500 font-bold hover:bg-amber-500/10 rounded-xl flex items-center justify-center gap-1.5 text-[13px]"
                        >
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Handshake className="w-3.5 h-3.5" />}
                            합의 취소
                        </Button>
                    </div>

                    <ConfirmDialog
                        isOpen={showNoShow}
                        onOpenChange={setShowNoShow}
                        onConfirm={handleNoShow}
                        title="노쇼 신고"
                        description="낙찰자가 방문하지 않았나요? 노쇼 신고 시 해당 유저에게 스트라이크가 부과됩니다. 이벤트 다음날 정오까지 신고하지 않으면 방문이 자동 확인됩니다."
                        confirmText="노쇼 신고"
                        variant="danger"
                    />

                    <PromptDialog
                        isOpen={showMutualCancel}
                        onOpenChange={setShowMutualCancel}
                        onConfirm={handleMutualCancel}
                        title="합의 취소"
                        description="고객과 합의하여 경매를 취소합니다. 양측 모두 패널티가 부과되지 않습니다. 차순위 입찰자가 있으면 자동으로 낙찰이 전환됩니다."
                        placeholder="취소 사유를 입력하세요"
                        confirmText="합의 취소"
                    />
                </>
            )}
        </div>
    );
}
