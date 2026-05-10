"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";
import { CheckCircle, XCircle, Clock, ShieldCheck, AlertCircle } from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface VisitOffer {
    id: string;
    proposed_price: number;
    table_type: string | null;
    visit_result: "visited" | "noshow" | null;
    visit_marked_at: string | null;
    visit_requested_by: string | null;
    visit_requested_at: string | null;
    puzzle: {
        id: string;
        area: string;
        event_date: string;
        leader?: { display_name?: string | null; name?: string | null } | null;
    } | null;
    club?: { name: string | null } | null;
}

interface Props {
    /** 본 컴포넌트를 보고 있는 사용자(MD 또는 leader)의 ID */
    currentUserId: string;
    offer: VisitOffer;
    onUpdate?: () => void;
}

type CardState = "request" | "waiting" | "respond" | "done";

function deriveState(offer: VisitOffer, currentUserId: string): CardState {
    if (offer.visit_marked_at) return "done";
    if (offer.visit_requested_at && offer.visit_requested_by === currentUserId) return "waiting";
    if (offer.visit_requested_at && offer.visit_requested_by !== currentUserId) return "respond";
    return "request";
}

export function AcceptedPuzzleVisitCard({ currentUserId, offer, onUpdate }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localOffer, setLocalOffer] = useState<VisitOffer>(offer);
    const supabase = createClient();

    const state = deriveState(localOffer, currentUserId);

    const eventDate = localOffer.puzzle?.event_date
        ? dayjs(localOffer.puzzle.event_date).format("M/D (ddd)")
        : "날짜 미정";

    const leaderName =
        localOffer.puzzle?.leader?.display_name ||
        localOffer.puzzle?.leader?.name ||
        "방장";

    const handleRequest = async (result: "visited" | "noshow") => {
        if (!confirm(
            result === "noshow"
                ? "노쇼로 신고하시겠습니까? 관리자 검토 후 처리됩니다."
                : "거래완료를 신청하시겠습니까? (MD가 신청 시 즉시 확정 / 방장이 신청 시 MD 응답 또는 7일 후 자동 확정)"
        )) return;

        setLoading(true);
        setError(null);
        try {
            const { data, error: rpcError } = await supabase.rpc("request_puzzle_visit_confirm", {
                p_offer_id: localOffer.id,
                p_result: result,
            });
            if (rpcError) throw rpcError;
            const res = data as { success: boolean; error?: string; immediate?: boolean };
            if (!res.success) throw new Error(res.error || "처리 실패");

            const nowIso = new Date().toISOString();
            setLocalOffer({
                ...localOffer,
                visit_result: result,
                visit_requested_by: currentUserId,
                visit_requested_at: nowIso,
                // 즉시 확정 케이스(서버 응답 immediate=true)면 visit_marked_at도 설정 → "완료" 상태로 즉시 전환
                visit_marked_at: res.immediate ? nowIso : null,
            });
            onUpdate?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "처리 중 오류");
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async (action: "agree" | "dispute") => {
        const requestedResult = localOffer.visit_result;
        const confirmMessage = action === "agree"
            ? `상대편이 신청한 "${requestedResult === "visited" ? "거래완료" : "노쇼"}"에 동의하시겠습니까?`
            : "이의를 제기하시겠습니까? 관리자 검토로 넘어갑니다.";
        if (!confirm(confirmMessage)) return;

        setLoading(true);
        setError(null);
        try {
            const { data, error: rpcError } = await supabase.rpc("confirm_puzzle_visit", {
                p_offer_id: localOffer.id,
                p_action: action,
            });
            if (rpcError) throw rpcError;
            const res = data as { success: boolean; error?: string };
            if (!res.success) throw new Error(res.error || "처리 실패");

            setLocalOffer({
                ...localOffer,
                visit_marked_at: new Date().toISOString(),
                visit_result: action === "dispute" ? "noshow" : localOffer.visit_result,
            });
            onUpdate?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "처리 중 오류");
        } finally {
            setLoading(false);
        }
    };

    // 카드 헤더 (공통)
    const Header = (
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
    );

    // 상태별 색상
    const borderColor = {
        request: "border-amber-500/20",
        waiting: "border-neutral-800/40",
        respond: "border-blue-500/30",
        done: "border-neutral-800/30 opacity-60",
    }[state];

    return (
        <div className={`bg-[#1C1C1E] rounded-2xl p-4 border transition-all ${borderColor}`}>
            {Header}

            {/* 상태별 액션 */}
            {state === "request" && (
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={() => handleRequest("visited")}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-black text-sm rounded-xl transition-colors disabled:opacity-40"
                    >
                        <CheckCircle className="w-4 h-4" />
                        거래완료
                    </button>
                    <button
                        onClick={() => handleRequest("noshow")}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-neutral-800 hover:bg-red-500/20 text-red-400 hover:text-red-300 font-black text-sm rounded-xl border border-transparent hover:border-red-500/20 transition-all disabled:opacity-40"
                    >
                        <XCircle className="w-4 h-4" />
                        노쇼
                    </button>
                </div>
            )}

            {state === "waiting" && (
                <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500 font-bold bg-neutral-900/50 rounded-xl px-3 py-2.5">
                    <Clock className="w-3.5 h-3.5" />
                    상대편 응답 대기 중
                    <span className="text-neutral-600">
                        ({localOffer.visit_requested_at
                            ? `${dayjs(localOffer.visit_requested_at).fromNow()} 신청 · 7일 후 ${
                                localOffer.visit_result === "visited" ? "자동 확정" : "관리자 검토"
                            }`
                            : ""})
                    </span>
                </div>
            )}

            {state === "respond" && (
                <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold bg-blue-500/10 text-blue-400 rounded-xl px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5" />
                        상대편이 <span className="text-white">
                            {localOffer.visit_result === "visited" ? "거래완료" : "노쇼"}
                        </span>로 신청했습니다
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleConfirm("agree")}
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl transition-colors disabled:opacity-40"
                        >
                            <CheckCircle className="w-4 h-4" />
                            동의
                        </button>
                        <button
                            onClick={() => handleConfirm("dispute")}
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-neutral-800 hover:bg-red-500/20 text-red-400 hover:text-red-300 font-black text-sm rounded-xl border border-transparent hover:border-red-500/20 transition-all disabled:opacity-40"
                        >
                            <XCircle className="w-4 h-4" />
                            이의
                        </button>
                    </div>
                </div>
            )}

            {state === "done" && (
                <div className="mt-3">
                    <span
                        className={`inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full ${
                            localOffer.visit_result === "visited"
                                ? "bg-green-500/15 text-green-400"
                                : "bg-red-500/15 text-red-400"
                        }`}
                    >
                        {localOffer.visit_result === "visited" ? (
                            <>
                                <ShieldCheck className="w-3.5 h-3.5" /> 거래 확정
                            </>
                        ) : (
                            <>
                                <XCircle className="w-3.5 h-3.5" /> 노쇼 처리됨
                            </>
                        )}
                    </span>
                </div>
            )}

            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
    );
}
