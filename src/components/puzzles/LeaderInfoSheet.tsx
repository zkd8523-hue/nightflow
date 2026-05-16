"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getDealTier, isNewUser } from "@/lib/utils/dealTier";
import { ChevronDown, ChevronUp, History, Store, Users } from "lucide-react";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    leader: {
        deal_count_total?: number | null;
        created_at?: string | null;
        display_name?: string | null;
        name?: string | null;
        profile_image?: string | null;
    } | null;
}

const TIER_ROWS = [
    { key: "new",     label: "신규가입", desc: "가입 14일 이내",        threshold: null, color: "text-cyan-400" },
    { key: "silver",  label: "실버",     desc: "1회 이상 거래한 유저",  threshold: 1,    color: "text-neutral-200" },
    { key: "gold",    label: "골드",     desc: "신뢰할만한 VIP",        threshold: 3,    color: "text-amber-400" },
    { key: "diamond", label: "다이아",   desc: "진짜 큰손",             threshold: 10,   color: "text-cyan-300" },
];

export function LeaderInfoSheet({ open, onOpenChange, leader }: Props) {
    const [showTierInfo, setShowTierInfo] = useState(false);

    if (!leader) return null;

    const tier = getDealTier(leader.deal_count_total ?? 0);
    const dealCount = leader.deal_count_total ?? 0;
    const leaderIsNew = isNewUser(leader.created_at);

    const signedUpShort = leader.created_at
        ? (() => {
              const d = new Date(leader.created_at);
              const yy = String(d.getFullYear()).slice(2);
              const mm = String(d.getMonth() + 1).padStart(2, "0");
              const dd = String(d.getDate()).padStart(2, "0");
              return `${yy}.${mm}.${dd}`;
          })()
        : null;

    const daysAgo = leader.created_at
        ? Math.floor((Date.now() - new Date(leader.created_at).getTime()) / 86400000)
        : null;

    const tierLabel = tier === "diamond" ? "다이아"
        : tier === "gold" ? "골드"
        : tier === "silver" ? "실버"
        : leaderIsNew ? "신규가입"
        : "등급 없음";

    const tierColor = tier === "diamond" ? "text-cyan-300"
        : tier === "gold" ? "text-amber-400"
        : tier === "silver" ? "text-neutral-200"
        : leaderIsNew ? "text-cyan-400"
        : "text-neutral-500";

    const activeTierKey = tier ?? (leaderIsNew ? "new" : null);

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
                    {/* 프로필 헤더 */}
                    <div className="flex items-start gap-3">
                        <div className="w-14 h-14 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0 overflow-hidden">
                            {leader?.profile_image
                                ? <img src={leader.profile_image} alt="" className="w-full h-full object-cover" />
                                : <span className="text-2xl text-neutral-500">👤</span>
                            }
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="text-white font-black text-lg">
                                    {leader?.display_name || leader?.name || "방장"}
                                </h3>
                                {signedUpShort && (
                                    <span className="text-[10px] text-neutral-600 font-medium shrink-0 mt-1">
                                        가입일: {signedUpShort}
                                    </span>
                                )}
                            </div>
                            {/* 유저 등급 인라인 */}
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[11px] text-neutral-500">유저등급:</span>
                                <span className={`text-[12px] font-black ${tierColor}`}>
                                    {tierLabel}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowTierInfo((v) => !v)}
                                    className="flex items-center gap-0.5 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
                                >
                                    등급제도 보기
                                    {showTierInfo
                                        ? <ChevronUp className="w-3 h-3" />
                                        : <ChevronDown className="w-3 h-3" />
                                    }
                                </button>
                            </div>

                            {/* 등급제도 설명 (토글) */}
                            {showTierInfo && (
                                <div className="mt-2 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 space-y-1.5">
                                    <div className="grid gap-y-1.5" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                                        {TIER_ROWS.map((row) => {
                                            const isActive = row.key === activeTierKey;
                                            return (
                                                <>
                                                    <span
                                                        key={`${row.key}-label`}
                                                        className={`text-[11px] font-black pr-2 shrink-0 ${
                                                            isActive ? row.color : "text-neutral-600"
                                                        }`}
                                                    >
                                                        {row.label}
                                                    </span>
                                                    <span
                                                        key={`${row.key}-desc`}
                                                        className={`text-[11px] ${isActive ? "text-neutral-400" : "text-neutral-700"}`}
                                                    >
                                                        {row.desc}
                                                    </span>
                                                    <span
                                                        key={`${row.key}-threshold`}
                                                        className={`text-[11px] text-right pl-3 ${isActive ? "text-neutral-500" : "text-neutral-700"}`}
                                                    >
                                                        {row.threshold !== null ? `거래 ${row.threshold}회+` : "—"}
                                                    </span>
                                                </>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 누적 거래 */}
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

                    {/* MD 평가 (예정) */}
                    <div>
                        <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                            <Store className="w-3.5 h-3.5" />
                            MD 평가
                        </div>
                        <div className="bg-neutral-900/30 border border-dashed border-neutral-800 rounded-2xl py-6 text-center px-4">
                            <p className="text-[12px] text-neutral-500 font-bold">
                                받은 평가가 아직 없어요
                            </p>
                            <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
                                거래가 쌓이면 MD가 남긴 평가가 표시됩니다
                            </p>
                        </div>
                    </div>

                    {/* 파티원 평가 (예정) */}
                    <div>
                        <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                            <Users className="w-3.5 h-3.5" />
                            같이 간 파티원 평가
                        </div>
                        <div className="bg-neutral-900/30 border border-dashed border-neutral-800 rounded-2xl py-6 text-center px-4">
                            <p className="text-[12px] text-neutral-500 font-bold">
                                받은 평가가 아직 없어요
                            </p>
                            <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
                                함께 놀러 간 멤버들의 평가가 표시됩니다
                            </p>
                        </div>
                    </div>

                    {/* 최근 거래 (예정) */}
                    <div>
                        <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                            <History className="w-3.5 h-3.5" />
                            최근 거래
                        </div>
                        <div className="bg-neutral-900/30 border border-dashed border-neutral-800 rounded-2xl py-6 text-center px-4">
                            <p className="text-[12px] text-neutral-500 font-bold">
                                거래 기록이 아직 없어요
                            </p>
                            <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
                                양쪽이 거래완료에 동의한 깃발/경매가 여기 표시됩니다
                            </p>
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
