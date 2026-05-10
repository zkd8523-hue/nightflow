"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TrustBadge } from "@/components/ui/TrustBadge";
import { getDealTier, isNewUser } from "@/lib/utils/dealTier";
import { History } from "lucide-react";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 닉네임/사진은 의도적으로 사용하지 않음 (비공개). 등급/신규 판별용 필드만 활용. */
    leader: {
        deal_count_total?: number | null;
        created_at?: string | null;
    } | null;
}

/**
 * 깃발 상세 페이지의 "유저 정보" 버튼 클릭 시 노출되는 하단 시트.
 * 닉네임 + 거래 등급(Silver/Gold/Diamond) + 거래 횟수 + 최근 거래(추후).
 */
export function LeaderInfoSheet({ open, onOpenChange, leader }: Props) {
    if (!leader) return null;

    const tier = getDealTier(leader.deal_count_total ?? 0);
    const dealCount = leader.deal_count_total ?? 0;
    const leaderIsNew = isNewUser(leader.created_at);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl sm:max-w-lg sm:mx-auto"
            >
                <SheetHeader className="mb-5 text-left">
                    <SheetTitle className="text-white font-black text-xl">
                        방장 정보
                    </SheetTitle>
                </SheetHeader>

                <div className="space-y-5 pb-8">
                    {/* 프로필 헤더 — 닉네임/사진 비공개, 등급/거래 횟수만 노출 */}
                    <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
                            <span className="text-2xl text-neutral-500">👤</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-white font-black text-lg">방장</h3>
                                <TrustBadge tier={tier} isNew={leaderIsNew} size="md" showLabel />
                            </div>
                            <p className="text-neutral-500 text-xs mt-0.5">
                                거래 {dealCount}회
                            </p>
                        </div>
                    </div>

                    {/* 통계 카드 */}
                    <div className="bg-neutral-900/50 border border-neutral-800/40 rounded-2xl px-4 py-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider">
                                누적 거래
                            </span>
                            <span className="text-2xl font-black text-white">
                                {dealCount}
                                <span className="text-sm text-neutral-500 font-bold ml-0.5">회</span>
                            </span>
                        </div>
                        <p className="text-[11px] text-neutral-600 mt-2 leading-relaxed">
                            깃발 거래완료 + 경매 거래확정 합산. 양쪽이 거래완료에 동의해야 누적됩니다.
                        </p>
                    </div>

                    {/* 최근 거래 (추후) */}
                    <div>
                        <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                            <History className="w-3.5 h-3.5" />
                            최근 거래
                        </div>
                        <div className="bg-neutral-900/30 border border-dashed border-neutral-800 rounded-2xl py-8 text-center">
                            <p className="text-[12px] text-neutral-600">
                                거래 기록은 추후 공개됩니다
                            </p>
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
