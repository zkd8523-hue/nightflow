"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";
import { CheckCircle, ShieldCheck } from "lucide-react";
import dayjs from "dayjs";
import "dayjs/locale/ko";

dayjs.locale("ko");

interface VisitOffer {
    id: string;
    proposed_price: number;
    table_type: string | null;
    visit_marked_at: string | null;
    puzzle: {
        id: string;
        area: string;
        event_date: string;
        leader?: { display_name?: string | null; name?: string | null } | null;
    } | null;
    club?: { name: string | null } | null;
}

interface Props {
    offer: VisitOffer;
    onUpdate?: () => void;
}

/**
 * MD 일방 거래완료 마킹 카드 (Migration 147 — 옵션 iv).
 * MD가 본인의 accepted offer 중 event_date 지난 것에 대해 거래완료 마킹.
 * 즉시 확정 → 양쪽 deal_count_total +1.
 * leader는 신청권/응답권 없음 (이 카드는 MD 대시보드에서만 노출).
 */
export function AcceptedPuzzleVisitCard({ offer, onUpdate }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localOffer, setLocalOffer] = useState<VisitOffer>(offer);
    const supabase = createClient();

    const done = !!localOffer.visit_marked_at;

    const eventDate = localOffer.puzzle?.event_date
        ? dayjs(localOffer.puzzle.event_date).format("M/D (ddd)")
        : "날짜 미정";

    const leaderName =
        localOffer.puzzle?.leader?.display_name ||
        localOffer.puzzle?.leader?.name ||
        "방장";

    const handleMark = async () => {
        if (!confirm("거래완료로 마킹하시겠습니까? 즉시 확정되며 양쪽 거래 카운트가 +1됩니다.")) return;

        setLoading(true);
        setError(null);
        try {
            const { data, error: rpcError } = await supabase.rpc("mark_puzzle_visited", {
                p_offer_id: localOffer.id,
            });
            if (rpcError) throw rpcError;
            const res = data as { success: boolean; error?: string };
            if (!res.success) throw new Error(res.error || "처리 실패");

            setLocalOffer({
                ...localOffer,
                visit_marked_at: new Date().toISOString(),
            });
            onUpdate?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "처리 중 오류");
        } finally {
            setLoading(false);
        }
    };

    const borderColor = done ? "border-neutral-800/30 opacity-60" : "border-amber-500/20";

    return (
        <div className={`bg-[#1C1C1E] rounded-2xl p-4 border transition-all ${borderColor}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-black text-white">{eventDate}</span>
                        {localOffer.puzzle?.area && (
                            <span className="text-xs text-neutral-500 font-bold">· {localOffer.puzzle.area}</span>
                        )}
                        {localOffer.club?.name && (
                            <span className="text-xs text-neutral-500 font-bold">· {localOffer.club.name}</span>
                        )}
                    </div>
                    <div className="text-xs text-neutral-400">
                        {localOffer.table_type && <span>{localOffer.table_type} · </span>}
                        <span className="text-green-400 font-bold">{formatPrice(localOffer.proposed_price)}</span>
                        <span className="text-neutral-600"> · 방장 {leaderName}</span>
                    </div>
                </div>
            </div>

            {!done && (
                <button
                    onClick={handleMark}
                    disabled={loading}
                    className="w-full mt-3 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-black text-sm rounded-xl transition-colors disabled:opacity-40"
                >
                    <CheckCircle className="w-4 h-4" />
                    {loading ? "처리 중..." : "거래완료"}
                </button>
            )}

            {done && (
                <div className="mt-3">
                    <span className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full bg-green-500/15 text-green-400">
                        <ShieldCheck className="w-3.5 h-3.5" /> 거래 확정
                    </span>
                </div>
            )}

            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
    );
}
