"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getDealTier, isNewUser } from "@/lib/utils/dealTier";
import { ChevronDown, ChevronUp, History } from "lucide-react";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 시트 제목 (기본 "유저 정보"). 채팅 등에서 "MD 정보"로 재사용 */
    title?: string;
    leader: {
        deal_count_total?: number | null;
        deal_amount_total?: number | null;
        consultation_count?: number | null;
        created_at?: string | null;
        display_name?: string | null;
        name?: string | null;
        profile_image?: string | null;
        last_seen_at?: string | null;
    } | null;
}

// 활동 시그널: 24시간 / 3일 / 7일. 7일 초과는 미표시 (부정 시그널 방지)
function getActivityBadge(lastSeenAt: string | null | undefined): { label: string; color: string; dot: string } | null {
    if (!lastSeenAt) return null;
    const diffMs = Date.now() - new Date(lastSeenAt).getTime();
    const hours = diffMs / (1000 * 60 * 60);
    if (hours < 24) return { label: "활동 중", color: "text-money", dot: "bg-green-500" };
    if (hours < 72) return { label: "최근 활동", color: "text-yellow-400", dot: "bg-yellow-500" };
    if (hours < 168) return { label: "이번 주 활동", color: "text-orange-400", dot: "bg-orange-500" };
    return null;
}

const TIER_ROWS = [
    { key: "new",       label: "신규가입",  desc: "가입 14일 이내",       thresholdLabel: "—",        color: "text-cyan-400" },
    { key: "vip",       label: "VIP",       desc: "거래 검증된 유저",     thresholdLabel: "100만원+",  color: "text-brand-amber" },
    { key: "vvip",      label: "VVIP",      desc: "신뢰할만한 큰손",      thresholdLabel: "1000만원+", color: "text-cyan-300" },
    { key: "president", label: "President", desc: "최상위 거래자",        thresholdLabel: "5000만원+", color: "text-yellow-300" },
];

export function LeaderInfoSheet({ open, onOpenChange, leader, title = "유저 정보" }: Props) {
    const [showTierInfo, setShowTierInfo] = useState(false);

    if (!leader) return null;

    const dealAmount = leader.deal_amount_total ?? 0;
    const tier = getDealTier(dealAmount);
    const dealCount = leader.deal_count_total ?? 0;
    const consultationCount = leader.consultation_count ?? 0;
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

    const tierLabel = tier === "president" ? "President"
        : tier === "vvip" ? "VVIP"
        : tier === "vip" ? "VIP"
        : leaderIsNew ? "신규가입"
        : "등급 없음";

    const tierColor = tier === "president" ? "text-yellow-300"
        : tier === "vvip" ? "text-cyan-300"
        : tier === "vip" ? "text-brand-amber"
        : leaderIsNew ? "text-cyan-400"
        : "text-muted-foreground";

    const activeTierKey = tier ?? (leaderIsNew ? "new" : null);

    const activityBadge = getActivityBadge(leader.last_seen_at);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="bg-card border-border rounded-t-3xl sm:max-w-lg sm:mx-auto"
            >
                <SheetHeader className="mb-5 text-left">
                    <SheetTitle className="text-foreground font-black text-xl">
                        {title}
                    </SheetTitle>
                </SheetHeader>

                <div className="space-y-5 pb-8">
                    {/* 프로필 헤더 */}
                    <div className="flex items-start gap-3">
                        <div className="w-14 h-14 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden">
                            {leader?.profile_image
                                ? <img src={leader.profile_image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                : <span className="text-2xl text-muted-foreground">👤</span>
                            }
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <h3 className="text-foreground font-black text-lg">
                                        {leader?.display_name || leader?.name || "방장"}
                                    </h3>
                                    {activityBadge && (
                                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${activityBadge.color}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${activityBadge.dot}`} />
                                            {activityBadge.label}
                                        </span>
                                    )}
                                </div>
                                {signedUpShort && (
                                    <span className="text-[10px] text-muted-foreground font-medium shrink-0 mt-1">
                                        가입일: {signedUpShort}
                                    </span>
                                )}
                            </div>
                            {/* 유저 등급 인라인 */}
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[11px] text-muted-foreground">유저등급:</span>
                                <span className={`text-[12px] font-black ${tierColor}`}>
                                    {tierLabel}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowTierInfo((v) => !v)}
                                    className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground/80 transition-colors"
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
                                <div className="mt-2 bg-card border border-border rounded-xl px-3 py-2.5 space-y-1.5">
                                    <div className="grid gap-y-1.5" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                                        {TIER_ROWS.map((row) => {
                                            const isActive = row.key === activeTierKey;
                                            return (
                                                <>
                                                    <span
                                                        key={`${row.key}-label`}
                                                        className={`text-[11px] font-black pr-2 shrink-0 ${
                                                            isActive ? row.color : "text-muted-foreground"
                                                        }`}
                                                    >
                                                        {row.label}
                                                    </span>
                                                    <span
                                                        key={`${row.key}-desc`}
                                                        className={`text-[11px] ${isActive ? "text-muted-foreground" : "text-muted-foreground"}`}
                                                    >
                                                        {row.desc}
                                                    </span>
                                                    <span
                                                        key={`${row.key}-threshold`}
                                                        className={`text-[11px] text-right pl-3 ${isActive ? "text-muted-foreground" : "text-muted-foreground"}`}
                                                    >
                                                        {row.thresholdLabel}
                                                    </span>
                                                </>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 상담 횟수 */}
                    <div className="bg-card/50 border border-border/40 rounded-2xl px-4 py-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">
                                상담 횟수
                            </span>
                            <span className="text-2xl font-black text-foreground">
                                {consultationCount}
                                <span className="text-sm text-muted-foreground font-bold ml-0.5">회</span>
                            </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                            MD와 실제로 메시지를 주고받은 오퍼 수
                        </p>
                    </div>

                    {/* 최근 거래 (예정, 거래 이력 있을 때만 노출) */}
                    {dealCount > 0 && (
                        <div>
                            <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                <History className="w-3.5 h-3.5" />
                                최근 거래
                            </div>
                            <div className="bg-card/30 border border-dashed border-border rounded-2xl py-6 text-center px-4">
                                <p className="text-[12px] text-muted-foreground font-bold">
                                    거래 기록이 아직 없어요
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                    양쪽이 거래완료에 동의한 깃발/경매가 여기 표시됩니다
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
