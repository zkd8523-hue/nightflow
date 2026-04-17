"use client";

import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateGroup } from "@/components/ui/DateGroup";
import { ConfirmVisitButton } from "@/components/md/ConfirmVisitButton";
import { ContactTimer } from "@/components/auctions/ContactTimer";
import { formatEventDate, formatPrice } from "@/lib/utils/format";
import { ChevronLeft, ChevronDown, Ticket, User, AlertCircle } from "lucide-react";
import Link from "next/link";

export interface TransactionItem {
    auctionId: string;
    auctionStatus: string;
    listingType?: string;
    clubName: string | undefined;
    eventDate: string;
    winner: { display_name?: string; noshow_count?: number; strike_count?: number } | null;
    contactDeadline: string | null;
    createdAt: string;
    winningPrice: number | null;
    chatInterestCount?: number;
}

type ActiveSortKey = "urgency" | "event_date" | "winning_price";
type HistorySortKey = "latest" | "winning_price";

const ACTIVE_SORT_OPTIONS: { key: ActiveSortKey; label: string }[] = [
    { key: "urgency", label: "긴급순" },
    { key: "event_date", label: "방문일순" },
    { key: "winning_price", label: "낙찰가순" },
];

const HISTORY_SORT_OPTIONS: { key: HistorySortKey; label: string }[] = [
    { key: "latest", label: "최신순" },
    { key: "winning_price", label: "낙찰가순" },
];

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; label: string; pulse?: boolean }> = {
    won: { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/20", label: "연락 대기", pulse: true },
    confirmed: { bg: "bg-green-500/10", text: "text-green-500", border: "border-green-500/20", label: "거래완료" },
    cancelled: { bg: "bg-neutral-500/10", text: "text-neutral-500", border: "border-neutral-700/30", label: "취소" },
    instant_active: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", label: "대화중", pulse: true },
};

interface TransactionListProps {
    items: TransactionItem[];
}

export function TransactionList({ items }: TransactionListProps) {
    const [activeSortKey, setActiveSortKey] = useState<ActiveSortKey>("urgency");
    const [historySortKey, setHistorySortKey] = useState<HistorySortKey>("latest");
    const [showOlder, setShowOlder] = useState(false);

    const activeItems = useMemo(() => items.filter(i =>
        i.auctionStatus === "won" ||
        (i.listingType === "instant" && i.auctionStatus === "active" && (i.chatInterestCount || 0) > 0)
    ), [items]);
    const historyItems = useMemo(() => items.filter(i => ["confirmed", "cancelled"].includes(i.auctionStatus)), [items]);

    // 진행중 정렬
    const sortedActive = useMemo(() => {
        const sorted = [...activeItems];
        switch (activeSortKey) {
            case "urgency":
                return sorted.sort((a, b) => {
                    if (a.auctionStatus === "won" && b.auctionStatus !== "won") return -1;
                    if (a.auctionStatus !== "won" && b.auctionStatus === "won") return 1;
                    if (a.auctionStatus === "won" && b.auctionStatus === "won") {
                        return (a.contactDeadline || "").localeCompare(b.contactDeadline || "");
                    }
                    return a.eventDate.localeCompare(b.eventDate);
                });
            case "event_date":
                return sorted.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
            case "winning_price":
                return sorted.sort((a, b) => (b.winningPrice || 0) - (a.winningPrice || 0));
            default:
                return sorted;
        }
    }, [activeItems, activeSortKey]);

    // 완료 정렬
    const sortedHistory = useMemo(() => {
        const sorted = [...historyItems];
        switch (historySortKey) {
            case "latest":
                return sorted.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
            case "winning_price":
                return sorted.sort((a, b) => (b.winningPrice || 0) - (a.winningPrice || 0));
            default:
                return sorted;
        }
    }, [historyItems, historySortKey]);

    // 날짜 그룹핑 (긴급순 제외)
    const groupedActive = useMemo(() => {
        if (activeSortKey === "urgency") return null;
        return groupByDate(sortedActive);
    }, [sortedActive, activeSortKey]);

    // 완료 날짜 그룹핑 + 더보기
    const { groupedHistory, recentDates, olderDates, olderCount } = useMemo(() => {
        const grouped = groupByDate(sortedHistory);
        const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
        return {
            groupedHistory: grouped,
            recentDates: dates.slice(0, 7),
            olderDates: dates.slice(7),
            olderCount: dates.slice(7).reduce((sum, d) => sum + grouped[d].length, 0),
        };
    }, [sortedHistory]);

    return (
        <div className="max-w-lg mx-auto pb-24 text-white">
            <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Link href="/md/dashboard" className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
                        <ChevronLeft className="w-5 h-5 text-neutral-400" />
                    </Link>
                    <h1 className="text-2xl font-black tracking-tight">낙찰 관리</h1>
                </div>


                {/* Tabs */}
                <Tabs defaultValue="active" className="w-full">
                    <TabsList className="w-full bg-neutral-900 border border-neutral-800 rounded-xl h-11">
                        <TabsTrigger value="active" className="flex-1 rounded-lg text-[13px] font-bold data-[state=active]:bg-white data-[state=active]:text-black">
                            진행중
                            {activeItems.length > 0 && (
                                <span className="ml-1.5 text-[11px] font-bold">{activeItems.length}</span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="history" className="flex-1 rounded-lg text-[13px] font-bold data-[state=active]:bg-white data-[state=active]:text-black">
                            완료
                            {historyItems.length > 0 && (
                                <span className="ml-1.5 text-[11px] font-bold">{historyItems.length}</span>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* 진행중 탭 */}
                    <TabsContent value="active" className="space-y-4 m-0 mt-4">
                        {activeItems.length > 3 && (
                            <SortChips
                                options={ACTIVE_SORT_OPTIONS}
                                selected={activeSortKey}
                                onSelect={(key) => setActiveSortKey(key as ActiveSortKey)}
                            />
                        )}

                        {sortedActive.length > 0 ? (
                            groupedActive ? (
                                Object.keys(groupedActive)
                                    .sort((a, b) => a.localeCompare(b))
                                    .map(date => (
                                        <DateGroup key={date} date={date} showCount>
                                            {groupedActive[date].map(item => (
                                                <TransactionCard key={item.auctionId} item={item} />
                                            ))}
                                        </DateGroup>
                                    ))
                            ) : (
                                sortedActive.map(item => (
                                    <TransactionCard key={item.auctionId} item={item} />
                                ))
                            )
                        ) : (
                            <EmptyState label="진행 중인 낙찰이 없습니다." />
                        )}
                    </TabsContent>

                    {/* 완료 탭 */}
                    <TabsContent value="history" className="space-y-4 m-0 mt-4">
                        {historyItems.length > 0 && (
                            <SortChips
                                options={HISTORY_SORT_OPTIONS}
                                selected={historySortKey}
                                onSelect={(key) => setHistorySortKey(key as HistorySortKey)}
                            />
                        )}

                        {sortedHistory.length > 0 ? (
                            historySortKey === "winning_price" ? (
                                sortedHistory.map(item => (
                                    <TransactionCard key={item.auctionId} item={item} />
                                ))
                            ) : (
                                <>
                                    {recentDates.map(date => (
                                        <DateGroup key={date} date={date} showCount>
                                            {groupedHistory[date].map(item => (
                                                <TransactionCard key={item.auctionId} item={item} />
                                            ))}
                                        </DateGroup>
                                    ))}
                                    {olderDates.length > 0 && (
                                        showOlder ? (
                                            olderDates.map(date => (
                                                <DateGroup key={date} date={date} showCount>
                                                    {groupedHistory[date].map(item => (
                                                        <TransactionCard key={item.auctionId} item={item} />
                                                    ))}
                                                </DateGroup>
                                            ))
                                        ) : (
                                            <button
                                                onClick={() => setShowOlder(true)}
                                                className="w-full py-3 flex items-center justify-center gap-1.5 text-[13px] font-bold text-neutral-500 hover:text-neutral-300 bg-neutral-900/50 rounded-xl border border-neutral-800/50 transition-colors"
                                            >
                                                이전 거래 {olderCount}건 더보기
                                                <ChevronDown className="w-4 h-4" />
                                            </button>
                                        )
                                    )}
                                </>
                            )
                        ) : (
                            <EmptyState label="완료된 거래 내역이 없습니다." />
                        )}
                    </TabsContent>
                </Tabs>

                <p className="text-[10px] text-neutral-600 text-center px-4 pb-2">
                    낙찰자 개인정보는 방문 확인 목적으로만 사용, 확인 후 즉시 파기해주세요.
                </p>
            </div>
        </div>
    );
}

// --- Sub-components ---

function SortChips<T extends string>({ options, selected, onSelect }: {
    options: { key: T; label: string }[];
    selected: T;
    onSelect: (key: T) => void;
}) {
    return (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {options.map(opt => (
                <button
                    key={opt.key}
                    onClick={() => onSelect(opt.key)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors border ${
                        selected === opt.key
                            ? "bg-white text-black border-white"
                            : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-600"
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

function TransactionCard({ item }: { item: TransactionItem }) {
    const winner = item.winner;
    const strikeCount = winner?.strike_count || 0;
    const isInstantActive = item.listingType === "instant" && item.auctionStatus === "active";
    const config = isInstantActive
        ? STATUS_CONFIG.instant_active
        : (STATUS_CONFIG[item.auctionStatus] || STATUS_CONFIG.cancelled);
    const isActive = item.auctionStatus === "won" || isInstantActive;

    return (
        <Card className="bg-[#1C1C1E] border-neutral-800/50 overflow-hidden shadow-xl">
            <div className="p-4 space-y-3">
                {/* Row 1: Status + Club + Price */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 min-w-0">
                        <Badge className={`${config.bg} ${config.text} ${config.border} text-[10px] h-5 shrink-0 ${config.pulse ? "animate-pulse" : ""}`}>
                            {config.label}
                        </Badge>
                        <h3 className="text-[15px] font-black text-white truncate">{item.clubName}</h3>
                    </div>
                    {item.winningPrice != null && (
                        <span className="text-[15px] font-black text-green-500 shrink-0 ml-2">
                            {formatPrice(item.winningPrice)}
                        </span>
                    )}
                </div>

                {/* Row 2: Event date + Winner / Chat count */}
                <div className="flex items-center justify-between text-[13px]">
                    <span className="text-neutral-400 font-medium">{formatEventDate(item.eventDate)}</span>
                    {isInstantActive ? (
                        <span className="text-blue-400 font-bold text-[12px]">
                            💬 {item.chatInterestCount || 0}명이 관심
                        </span>
                    ) : winner ? (
                        <div className="flex items-center gap-1.5 text-neutral-300">
                            <User className="w-3 h-3 text-neutral-500" />
                            <span className="font-bold">{winner.display_name || "유저"}</span>
                        </div>
                    ) : null}
                </div>


                {/* Contact Timer (won only, 경매만) */}
                {item.auctionStatus === "won" && item.contactDeadline && !isInstantActive && (
                    <ContactTimer deadline={item.contactDeadline} />
                )}

                {/* Strike Warning */}
                {strikeCount > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <p className="text-[11px] text-red-500 font-bold">
                            주의! 스트라이크 {strikeCount}회 유저
                        </p>
                    </div>
                )}

                {/* Action Buttons */}
                {isInstantActive ? (
                    <ConfirmVisitButton auctionId={item.auctionId} auctionStatus="instant_active" />
                ) : isActive ? (
                    <ConfirmVisitButton auctionId={item.auctionId} auctionStatus={item.auctionStatus} />
                ) : null}

                {/* Completed status indicator */}
                {item.auctionStatus === "confirmed" && (
                    <div className="text-center py-1 text-[12px] font-bold text-green-500/70">거래완료</div>
                )}
                {item.auctionStatus === "cancelled" && (
                    <div className="text-center py-1 text-[12px] font-bold text-neutral-500">취소됨</div>
                )}
            </div>
        </Card>
    );
}

function EmptyState({ label }: { label: string }) {
    return (
        <div className="text-center py-20 bg-neutral-900/30 rounded-3xl border border-dashed border-neutral-800">
            <Ticket className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
            <p className="text-neutral-500 font-bold">{label}</p>
        </div>
    );
}

// --- Helpers ---

function groupByDate(items: TransactionItem[]): Record<string, TransactionItem[]> {
    return items.reduce((groups, item) => {
        const date = item.eventDate;
        if (!groups[date]) groups[date] = [];
        groups[date].push(item);
        return groups;
    }, {} as Record<string, TransactionItem[]>);
}
