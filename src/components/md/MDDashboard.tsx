"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MDAuctionCard } from "./MDAuctionCard";
import type { Auction, User, Club } from "@/types/database";
import { Plus, TrendingUp, Users, Ticket, MapPin, ChevronDown, Settings, CheckCircle, Trash2, CheckSquare, Square, Heart } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { DateGroup } from "@/components/ui/DateGroup";
import dayjs from "dayjs";
import "dayjs/locale/ko";

import { isAuctionExpired, isAuctionActive } from "@/lib/utils/auction";
import { useBidNotification } from "@/hooks/useBidNotification";
import { getErrorMessage, logError } from "@/lib/utils/error";

export interface TopBidInfo {
    bidder_name: string;
    bid_amount: number;
}

interface MDDashboardProps {
    user: User;
    initialAuctions: Auction[];
    initialClubs: Club[];
    initialTopBids?: Record<string, TopBidInfo>;
}

export function MDDashboard({ user, initialAuctions, initialClubs, initialTopBids = {} }: MDDashboardProps) {
    const [auctions, setAuctions] = useState<Auction[]>(initialAuctions);
    const [clubs, setClubs] = useState<Club[]>(initialClubs);
    const [topBids, setTopBids] = useState<Record<string, TopBidInfo>>(initialTopBids);
    const [showOlder, setShowOlder] = useState(false);
    const [defaultClubId, setDefaultClubId] = useState<string | null>(user.default_club_id);
    const [statusFilter, setStatusFilter] = useState<"all" | "action" | "done" | "none">("all");
    const [loading, setLoading] = useState(false);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [clubSheetOpen, setClubSheetOpen] = useState(false);
    const [favoriteMdCount, setFavoriteMdCount] = useState<number>(0);
    const supabase = createClient();

    // 나를 찜한 유저 수
    useEffect(() => {
        const fetchFavoriteCount = async () => {
            const { count } = await supabase
                .from("user_favorite_mds")
                .select("id", { count: "exact", head: true })
                .eq("md_id", user.id);
            setFavoriteMdCount(count ?? 0);
        };
        fetchFavoriteCount();
    }, [user.id, supabase]);

    const activeClub = clubs.find(c => c.id === defaultClubId)
        ?? clubs.find(c => c.status === "approved")
        ?? clubs[0] ?? null;

    // 진행 중인 경매에 대한 실시간 입찰 알림
    const activeAuctionIds = auctions
        .filter(a => a.status === "active")
        .map(a => a.id);
    useBidNotification(activeAuctionIds, activeAuctionIds.length > 0);

    const handleAuctionDelete = (auctionId: string) => {
        setAuctions(auctions.filter(a => a.id !== auctionId));
    };

    const toggleSelectMode = () => {
        setSelectMode(v => !v);
        setSelectedIds(new Set());
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = (ids: string[]) => {
        if (ids.every(id => selectedIds.has(id))) {
            setSelectedIds(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
        } else {
            setSelectedIds(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        setBulkDeleting(true);
        try {
            await Promise.all([...selectedIds].map(id =>
                fetch(`/api/auctions/${id}/delete`, { method: "DELETE" })
            ));
            setAuctions(prev => prev.filter(a => !selectedIds.has(a.id)));
            toast.success(`${selectedIds.size}건 삭제되었습니다.`);
            setSelectedIds(new Set());
            setSelectMode(false);
        } catch {
            toast.error("일부 항목 삭제에 실패했습니다.");
        } finally {
            setBulkDeleting(false);
        }
    };

    const handleSetDefaultClub = async (clubId: string | null) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc("set_default_club", {
                p_club_id: clubId,
            });

            if (error) throw error;

            if (data?.success) {
                setDefaultClubId(clubId);
                toast.success(data.message || "기본 클럽이 설정되었습니다");
            } else {
                toast.error(data?.message || "기본 클럽 설정에 실패했습니다");
            }
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            logError(error, 'MDDashboard.handleSetDefaultClub');
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    // 3탭 분류: 오늘특가 / 얼리버드 / 종료 (listing_type 기준)
    const completedStatuses = ["won", "unsold", "confirmed", "cancelled"];

    const todayAuctions = auctions.filter(a =>
        a.listing_type === "instant" &&
        !completedStatuses.includes(a.status) &&
        !(a.status === "active" && isAuctionExpired(a))
    );

    const earlyBirdAuctions = auctions.filter(a =>
        a.listing_type === "auction" &&
        !completedStatuses.includes(a.status) &&
        !(a.status === "active" && isAuctionExpired(a))
    );

    const completedAuctions = auctions.filter(a =>
        completedStatuses.includes(a.status) ||
        (a.status === "active" && isAuctionExpired(a)) ||
        (a.status === "scheduled" && dayjs().isAfter(dayjs(a.auction_end_at)))
    );

    // 오늘특가 정렬: active 먼저 → 마감 임박순
    const sortedTodayAuctions = [...todayAuctions].sort((a, b) => {
        const aActive = isAuctionActive(a) ? 0 : 1;
        const bActive = isAuctionActive(b) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return dayjs(a.extended_end_at || a.auction_end_at).unix() - dayjs(b.extended_end_at || b.auction_end_at).unix();
    });

    // 얼리버드 정렬: active 먼저 → event_date 빠른순 → 시작시간순
    const sortedEarlyBirdAuctions = [...earlyBirdAuctions].sort((a, b) => {
        const aActive = isAuctionActive(a) ? 0 : 1;
        const bActive = isAuctionActive(b) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        const dateDiff = a.event_date.localeCompare(b.event_date);
        if (dateDiff !== 0) return dateDiff;
        return dayjs(a.auction_start_at).unix() - dayjs(b.auction_start_at).unix();
    });

    // 스마트 정렬: 액션 우선순위
    const getPriority = (status: string) => {
        switch (status) {
            case "won": return 1;       // 💰 정산/방문 대기
            case "confirmed": return 2; // ✅ 완료
            case "unsold": return 3;    // ⚪ 유찰
            case "cancelled": return 4; // 🔴 취소
            default: return 5;
        }
    };

    // 필터링 및 그룹핑 메모이제이션 (성능 최적화)
    const {
        doneCount,
        noneCount,
        filteredCompleted,
        groupedCompleted,
        recentDates,
        olderDates,
        olderCount
    } = useMemo(() => {
        // 필터 칩 카운트
        const done = completedAuctions.filter(a => a.status === "confirmed").length;
        const none = completedAuctions.filter(a => ["unsold", "cancelled"].includes(a.status)).length;

        // 필터 적용
        const filtered = statusFilter === "all"
            ? completedAuctions
            : statusFilter === "done"
                ? completedAuctions.filter(a => a.status === "confirmed")
                : completedAuctions.filter(a => ["unsold", "cancelled"].includes(a.status));

        // 일별 그룹핑 전에 우선순위 정렬
        const sorted = [...filtered].sort((a, b) => {
            const priorityDiff = getPriority(a.status) - getPriority(b.status);
            if (priorityDiff !== 0) return priorityDiff;
            return b.event_date.localeCompare(a.event_date);
        });

        // 일별 그룹핑 (event_date 기준, 최근 날짜 순)
        const grouped = sorted.reduce((groups, auction) => {
            const date = auction.event_date;
            if (!groups[date]) groups[date] = [];
            groups[date].push(auction);
            return groups;
        }, {} as Record<string, Auction[]>);

        const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
        const recent = dates.slice(0, 7);
        const older = dates.slice(7);
        const olderCnt = older.reduce((sum, d) => sum + grouped[d].length, 0);

        return {
            doneCount: done,
            noneCount: none,
            filteredCompleted: filtered,
            groupedCompleted: grouped,
            recentDates: recent,
            olderDates: older,
            olderCount: olderCnt
        };
    }, [completedAuctions, statusFilter, getPriority]);

    return (
        <div className="max-w-lg mx-auto pb-24">
            {/* Top Navigation */}
            <Header hideDashboardLink />

            {/* Header Profile Section */}
            <div className="px-6 py-4 space-y-4 text-white">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <h1 className="text-xl font-black tracking-tight">{user.name} MD님</h1>
                        <p className="text-neutral-500 text-[13px] font-medium">오늘도 대박 낙찰 기원합니다!</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/md/settings" className="flex items-center gap-1.5 text-neutral-500 hover:text-white transition-colors">
                            <Settings className="w-4 h-4" />
                            <span className="text-[12px] font-bold">프로필 설정</span>
                        </Link>
                    </div>
                </div>

                {/* Status Banner */}
                {user.md_status === 'suspended' && user.role !== 'admin' && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
                        <div className="flex items-start gap-3">
                            <span className="text-2xl mt-0.5">&#9208;&#65039;</span>
                            <div className="flex-1 space-y-1">
                                <p className="text-sm font-bold text-red-500">활동이 일시 정지되었습니다</p>
                                <p className="text-xs text-red-500/80 leading-relaxed">
                                    운영 정책 위반으로 경매 등록이 제한됩니다.
                                    {user.md_suspended_until && (
                                        <> 정지 해제 예정: <span className="font-semibold">
                                            {new Date(user.md_suspended_until).toLocaleDateString("ko-KR")}
                                        </span></>
                                    )}
                                </p>
                                <p className="text-xs text-red-500/70 mt-2">
                                    문의사항은 관리자에게 연락해주세요.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* pending 배너 제거됨 — MD 가입 즉시 approved */}
            </div>

            {/* Club Context Bar */}
            <div className="px-6 pb-2">
                {clubs.length === 0 ? (
                    <Link href="/md/clubs">
                        <div className="flex items-center gap-2 px-4 py-3 bg-[#1C1C1E] border border-dashed border-neutral-700 rounded-2xl">
                            <MapPin className="w-4 h-4 text-neutral-500 shrink-0" />
                            <span className="text-[13px] text-neutral-500 font-medium">클럽을 등록해주세요</span>
                            <Plus className="w-4 h-4 text-neutral-600 ml-auto" />
                        </div>
                    </Link>
                ) : clubs.length === 1 ? (
                    <div className="flex items-center gap-2 px-4 py-3 bg-[#1C1C1E] border border-neutral-800 rounded-2xl">
                        <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-[14px] font-bold text-white truncate">{clubs[0].name}</span>
                        <span className="text-neutral-600 text-[13px]">&middot;</span>
                        <span className="text-[13px] text-neutral-400">{clubs[0].area}</span>
                        <Link href="/md/clubs" className="ml-auto">
                            <Button variant="ghost" className="h-7 px-2 text-[11px] font-bold text-neutral-500 hover:text-white rounded-lg">
                                관리
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <button
                        onClick={() => setClubSheetOpen(true)}
                        className="w-full flex items-center gap-2 px-4 py-3 bg-[#1C1C1E] border border-neutral-800 rounded-2xl hover:border-neutral-700 transition-colors text-left"
                    >
                        <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
                        {activeClub ? (
                            <>
                                <span className="text-[14px] font-bold text-white truncate">{activeClub.name}</span>
                                <span className="text-neutral-600 text-[13px]">&middot;</span>
                                <span className="text-[13px] text-neutral-400">{activeClub.area}</span>
                            </>
                        ) : (
                            <span className="text-[13px] text-neutral-500">클럽을 선택해주세요</span>
                        )}
                        <div className="flex items-center gap-1 ml-auto shrink-0">
                            {defaultClubId && <span className="text-[11px] text-neutral-600 font-medium">기본 클럽</span>}
                            <ChevronDown className="w-4 h-4 text-neutral-500" />
                        </div>
                    </button>
                )}
            </div>

            {/* Auction Tabs + Register Button */}
            <div className="px-4 mt-1">
                <Tabs defaultValue="today" className="w-full">
                    <div className="flex items-center gap-2">
                        <TabsList className="flex-1 bg-neutral-900 border border-neutral-800/50 h-11 p-1 rounded-xl">
                            <TabsTrigger value="today" className="flex-1 rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white transition-colors hover:text-neutral-200">
                                🔥 오늘특가 {sortedTodayAuctions.length > 0 && <span className="ml-1 text-amber-500">{sortedTodayAuctions.length}</span>}
                            </TabsTrigger>
                            <TabsTrigger value="earlybird" className="flex-1 rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white transition-colors hover:text-neutral-200">
                                📅 얼리버드 {sortedEarlyBirdAuctions.length > 0 && <span className="ml-1 text-amber-500">{sortedEarlyBirdAuctions.length}</span>}
                            </TabsTrigger>
                            <TabsTrigger value="completed" className="flex-1 rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white transition-colors hover:text-neutral-200">
                                종료 {completedAuctions.length > 0 && <span className="ml-1 text-neutral-500">{completedAuctions.length}</span>}
                            </TabsTrigger>
                        </TabsList>

                    </div>

                    <div className="mt-4">
                        {/* 오늘특가: 현재 진행 중 경매 */}
                        <TabsContent value="today" className="space-y-4 m-0">
                            {sortedTodayAuctions.length > 0 ? (
                                sortedTodayAuctions.map(auction => (
                                    <MDAuctionCard key={auction.id} auction={auction} onDelete={() => handleAuctionDelete(auction.id)} topBidder={topBids[auction.id]} />
                                ))
                            ) : (
                                <EmptyState label="진행 중인 특가 경매가 없습니다." />
                            )}
                        </TabsContent>

                        {/* 얼리버드: 예정된 경매 */}
                        <TabsContent value="earlybird" className="space-y-4 m-0">
                            {sortedEarlyBirdAuctions.length > 0 ? (
                                sortedEarlyBirdAuctions.map(auction => (
                                    <MDAuctionCard key={auction.id} auction={auction} onDelete={() => handleAuctionDelete(auction.id)} topBidder={topBids[auction.id]} />
                                ))
                            ) : (
                                <EmptyState 
                                    label="얼리버드 경매가 없습니다." 
                                    description={<>오래 노출될수록 입찰 경쟁은 뜨거워집니다.<br/>주요 일정을 미리 올려 더 높은 낙찰가를 확보해 보세요.</>}
                                />
                            )}
                        </TabsContent>

                        {/* 종료/정산 */}
                        <TabsContent value="completed" className="space-y-4 m-0">
                            {completedAuctions.length > 0 && (
                                <>
                                    {/* 필터 칩 + 선택 모드 토글 */}
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
                                            {([
                                                { key: "all", label: "전체", count: completedAuctions.length, color: "" },
                                                { key: "done", label: "✅ 판매완료", count: doneCount, color: "text-green-400" },
                                                { key: "none", label: "유찰", count: noneCount, color: "text-neutral-500" },
                                            ] as const).map(chip => (
                                                <button
                                                    key={chip.key}
                                                    onClick={() => setStatusFilter(chip.key)}
                                                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors border ${
                                                        statusFilter === chip.key
                                                            ? "bg-white text-black border-white"
                                                            : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-600"
                                                    }`}
                                                >
                                                    <span className={statusFilter === chip.key ? "" : chip.color}>{chip.label}</span>
                                                    {chip.count > 0 && (
                                                        <span className={`ml-1 ${statusFilter === chip.key ? "text-neutral-500" : "text-neutral-600"}`}>
                                                            {chip.count}
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            onClick={toggleSelectMode}
                                            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
                                                selectMode
                                                    ? "bg-red-500/20 border-red-500/50 text-red-400"
                                                    : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600"
                                            }`}
                                        >
                                            {selectMode ? "취소" : "선택"}
                                        </button>
                                    </div>

                                    {/* 선택 모드 액션 바 */}
                                    {selectMode && (
                                        <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5">
                                            <button
                                                onClick={() => toggleSelectAll(filteredCompleted.map(a => a.id))}
                                                className="flex items-center gap-2 text-[13px] font-bold text-neutral-300"
                                            >
                                                {filteredCompleted.every(a => selectedIds.has(a.id))
                                                    ? <CheckSquare className="w-4 h-4 text-white" />
                                                    : <Square className="w-4 h-4 text-neutral-500" />
                                                }
                                                전체선택
                                            </button>
                                            <button
                                                onClick={handleBulkDelete}
                                                disabled={selectedIds.size === 0 || bulkDeleting}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-[12px] font-bold disabled:opacity-40 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                {bulkDeleting ? "삭제 중..." : `${selectedIds.size}건 삭제`}
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {filteredCompleted.length > 0 ? (
                                <>
                                    {recentDates.map(date => (
                                        <DateGroup key={date} date={date} showCount={true}>
                                            {groupedCompleted[date].map(auction => (
                                                <div key={auction.id} className="relative">
                                                    {selectMode && (
                                                        <button
                                                            onClick={() => toggleSelect(auction.id)}
                                                            className="absolute left-2 top-1/2 -translate-y-1/2 z-10"
                                                        >
                                                            {selectedIds.has(auction.id)
                                                                ? <CheckSquare className="w-5 h-5 text-white" />
                                                                : <Square className="w-5 h-5 text-neutral-600" />
                                                            }
                                                        </button>
                                                    )}
                                                    <div className={selectMode ? "pl-8" : ""}>
                                                        <MDAuctionCard auction={auction} onDelete={() => handleAuctionDelete(auction.id)} />
                                                    </div>
                                                </div>
                                            ))}
                                        </DateGroup>
                                    ))}
                                    {olderDates.length > 0 && (
                                        showOlder ? (
                                            olderDates.map(date => (
                                                <DateGroup key={date} date={date} showCount={true}>
                                                    {groupedCompleted[date].map(auction => (
                                                        <div key={auction.id} className="relative">
                                                            {selectMode && (
                                                                <button
                                                                    onClick={() => toggleSelect(auction.id)}
                                                                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10"
                                                                >
                                                                    {selectedIds.has(auction.id)
                                                                        ? <CheckSquare className="w-5 h-5 text-white" />
                                                                        : <Square className="w-5 h-5 text-neutral-600" />
                                                                    }
                                                                </button>
                                                            )}
                                                            <div className={selectMode ? "pl-8" : ""}>
                                                                <MDAuctionCard auction={auction} onDelete={() => handleAuctionDelete(auction.id)} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </DateGroup>
                                            ))
                                        ) : (
                                            <button
                                                onClick={() => setShowOlder(true)}
                                                className="w-full py-3 flex items-center justify-center gap-1.5 text-[13px] font-bold text-neutral-500 hover:text-neutral-300 bg-neutral-900/50 rounded-xl border border-neutral-800/50 transition-colors"
                                            >
                                                이전 경매 {olderCount}건 더보기
                                                <ChevronDown className="w-4 h-4" />
                                            </button>
                                        )
                                    )}
                                </>
                            ) : (
                                <EmptyState label={
                                    statusFilter === "done" ? "완료된 경매가 없습니다."
                                        : statusFilter === "none" ? "유찰된 경매가 없습니다."
                                            : "종료된 경매가 없습니다."
                                } />
                            )}
                        </TabsContent>
                    </div>
                </Tabs>
            </div>

            {/* Secondary Content: VIP, Stats */}
            <div className="px-6 py-6 space-y-4 text-white">
                {/* VIP 고객 */}
                <Link href="/md/vip">
                    <Button variant="outline" className="w-full h-14 bg-[#1C1C1E] border-neutral-800 text-white font-bold gap-2 rounded-2xl hover:bg-neutral-800 text-[14px]">
                        <Users className="w-5 h-5 text-amber-500" />
                        VIP 고객
                    </Button>
                </Link>

                {/* Performance Stats */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-[#1C1C1E] to-[#0A0A0A] border-neutral-800 rounded-[28px] p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                        <div className="space-y-1">
                            <p className="text-[11px] font-black text-neutral-500 uppercase tracking-widest">Performance</p>
                            <h2 className="text-[20px] font-black text-white">성과 요약</h2>
                        </div>
                        <TrendingUp className="w-5 h-5 text-green-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-neutral-500">
                                <Plus className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">나의 경매</span>
                            </div>
                            <p className="text-[24px] font-black text-white leading-none">{auctions.length}<span className="text-[12px] text-neutral-500 ml-0.5">건</span></p>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-neutral-500">
                                <Users className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">비딩수</span>
                            </div>
                            <p className="text-[24px] font-black text-white leading-none">
                                {auctions.reduce((acc, a) => acc + a.bid_count, 0)}<span className="text-[12px] text-neutral-500 ml-0.5">회</span>
                            </p>
                        </div>
                        <div className="space-y-1.5 pt-1 border-t border-neutral-800/50">
                            <div className="flex items-center gap-1.5 text-neutral-500">
                                <Ticket className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">낙찰건</span>
                            </div>
                            <p className="text-[24px] font-black text-amber-500 leading-none">
                                {auctions.filter(a => ["won", "confirmed"].includes(a.status)).length}<span className="text-[12px] text-neutral-500 ml-0.5">건</span>
                            </p>
                        </div>
                        <div className="space-y-1.5 pt-1 border-t border-neutral-800/50">
                            <div className="flex items-center gap-1.5 text-neutral-500">
                                <Heart className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">나를 찜한</span>
                            </div>
                            <p className="text-[24px] font-black text-red-400 leading-none">
                                {favoriteMdCount}<span className="text-[12px] text-neutral-500 ml-0.5">명</span>
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Club Selector Sheet (복수 클럽용) */}
            <Sheet open={clubSheetOpen} onOpenChange={setClubSheetOpen}>
                <SheetContent side="bottom" className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl max-h-[60vh]">
                    <SheetHeader className="pb-4">
                        <SheetTitle className="text-white font-black text-lg">내 클럽 목록</SheetTitle>
                    </SheetHeader>
                    <div className="space-y-2 overflow-y-auto pb-6">
                        {clubs.filter(c => c.status === "approved").map((club) => {
                            const isDefault = defaultClubId === club.id;
                            return (
                                <button
                                    key={club.id}
                                    onClick={() => {
                                        handleSetDefaultClub(isDefault ? null : club.id);
                                    }}
                                    disabled={loading}
                                    className={`w-full flex items-center gap-3 p-4 rounded-xl transition-colors text-left ${
                                        isDefault
                                            ? "bg-amber-500/10 border border-amber-500/20"
                                            : "bg-[#1C1C1E] border border-neutral-800 hover:border-neutral-700"
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-[15px] font-bold text-white truncate">{club.name}</h4>
                                        <p className="text-xs text-neutral-500 flex items-center gap-1 mt-1">
                                            <MapPin className="w-3 h-3" />
                                            {club.area}
                                        </p>
                                    </div>
                                    {isDefault && (
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className="text-[11px] text-amber-500 font-medium">기본 클럽</span>
                                            <CheckCircle className="w-5 h-5 text-amber-500" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                        <Link
                            href="/md/clubs"
                            onClick={() => setClubSheetOpen(false)}
                            className="flex items-center justify-center gap-1.5 py-3 text-[13px] font-bold text-neutral-500 hover:text-neutral-300 transition-colors"
                        >
                            <Settings className="w-3.5 h-3.5" />
                            클럽 관리
                        </Link>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

function EmptyState({ label, description }: { label: string, description?: React.ReactNode }) {
    return (
        <div className="py-16 text-center space-y-4 bg-[#1C1C1E]/30 rounded-3xl border border-dashed border-neutral-800/50">
            <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
                <TrendingUp className="w-8 h-8 text-neutral-700" />
            </div>
            <p className="text-neutral-500 font-medium text-sm">{label}</p>
            <p className="text-neutral-600 text-xs px-10 leading-relaxed">
                {description || (
                    <>번거로운 홍보 없이 등록만으로 수많은 유저들에게<br/>MD님의 상품을 알려보세요</>
                )}
            </p>
            <Link href="/md/auctions/new">
                <Button className="rounded-full bg-white text-black font-black hover:bg-neutral-200 h-10 px-6 mt-2">
                    <Plus className="w-4 h-4 mr-1" />
                    경매 등록하기
                </Button>
            </Link>
        </div>
    );
}
