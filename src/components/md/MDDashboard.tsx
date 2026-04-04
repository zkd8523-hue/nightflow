"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { MDAuctionCard } from "./MDAuctionCard";
import type { Auction, User, Club } from "@/types/database";
import { Plus, TrendingUp, Users, Ticket, MapPin, Eye, ChevronDown, Star, Settings, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { StatsCard } from "./StatsCard";
import { createClient } from "@/lib/supabase/client";
import { DateGroup } from "@/components/ui/DateGroup";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { getClubEventDate } from "@/lib/utils/date";
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
    const supabase = createClient();

    // 진행 중인 경매에 대한 실시간 입찰 알림
    const activeAuctionIds = auctions
        .filter(a => a.status === "active")
        .map(a => a.id);
    useBidNotification(activeAuctionIds, activeAuctionIds.length > 0);

    const handleAuctionDelete = (auctionId: string) => {
        setAuctions(auctions.filter(a => a.id !== auctionId));
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

    // 2탭 분류: 오늘의 경매 / 종료·정산
    const todayAuctions = auctions.filter(a =>
        isAuctionActive(a) ||
        (a.status === "scheduled" &&
         !isAuctionActive(a) &&
         !dayjs().isAfter(dayjs(a.auction_end_at)) &&
         dayjs(a.auction_start_at).isBefore(dayjs().add(48, "hour")))
    );
    const completedAuctions = auctions.filter(a =>
        ["won", "unsold", "contacted", "confirmed", "cancelled"].includes(a.status) ||
        (a.status === "active" && isAuctionExpired(a)) ||
        (a.status === "scheduled" && dayjs().isAfter(dayjs(a.auction_end_at))) ||
        (a.status === "scheduled" &&
         !isAuctionActive(a) &&
         !dayjs().isAfter(dayjs(a.auction_end_at)) &&
         dayjs(a.auction_start_at).isAfter(dayjs().add(48, "hour")))
    );

    // 오늘의 경매 정렬: active 먼저, 그 다음 scheduled (시작시간 순)
    const sortedTodayAuctions = [...todayAuctions].sort((a, b) => {
        const aActive = isAuctionActive(a) ? 0 : 1;
        const bActive = isAuctionActive(b) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return dayjs(a.auction_start_at).unix() - dayjs(b.auction_start_at).unix();
    });

    // 스마트 정렬: 액션 우선순위
    const getPriority = (status: string) => {
        switch (status) {
            case "contacted": return 1;  // ⚠️ 현장 확인 필요
            case "won": return 2;       // 💰 정산 대기
            case "confirmed": return 3; // ✅ 완료
            case "unsold": return 4;    // ⚪ 유찰
            case "cancelled": return 5; // 🔴 취소
            default: return 6;
        }
    };

    // 필터링 및 그룹핑 메모이제이션 (성능 최적화)
    const {
        actionCount,
        doneCount,
        noneCount,
        filteredCompleted,
        groupedCompleted,
        recentDates,
        olderDates,
        olderCount
    } = useMemo(() => {
        // 필터 칩 카운트
        const action = completedAuctions.filter(a => ["contacted", "won"].includes(a.status)).length;
        const done = completedAuctions.filter(a => a.status === "confirmed").length;
        const none = completedAuctions.filter(a => ["unsold", "cancelled"].includes(a.status)).length;

        // 필터 적용
        const filtered = statusFilter === "all"
            ? completedAuctions
            : statusFilter === "action"
                ? completedAuctions.filter(a => ["contacted", "won"].includes(a.status))
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
            actionCount: action,
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
            {/* Top Navigation / Logo */}
            <div className="px-6 pt-8 pb-2">
                <Link href="/" className="inline-flex items-center gap-2 group">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
                        <span className="text-black font-black text-xl leading-none">N</span>
                    </div>
                    <span className="text-white font-black text-lg tracking-tighter">NightFlow</span>
                </Link>
            </div>

            {/* Header Profile Section */}
            <div className="px-6 py-4 space-y-4 text-white">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <h1 className="text-xl font-black tracking-tight">{user.name} MD님</h1>
                        <p className="text-neutral-500 text-[13px] font-medium">오늘도 대박 낙찰 기원합니다!</p>
                    </div>
                    <Link href="/">
                        <Button variant="outline" className="rounded-full bg-[#1C1C1E] border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 h-10 px-3 gap-1.5">
                            <Eye className="w-4 h-4" />
                            <span className="text-[12px] font-bold">고객뷰</span>
                        </Button>
                    </Link>
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

            {/* Auction Tabs + Register Button */}
            <div className="px-4 mt-1">
                <Tabs defaultValue="today" className="w-full">
                    <div className="flex items-center gap-2">
                        <TabsList className="flex-1 bg-neutral-900 border border-neutral-800/50 h-11 p-1 rounded-xl">
                            <TabsTrigger value="today" className="flex-1 rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white transition-colors hover:text-neutral-200">
                                오늘의 경매 {sortedTodayAuctions.length > 0 && <span className="ml-1 text-red-500">{sortedTodayAuctions.length}</span>}
                            </TabsTrigger>
                            <TabsTrigger value="completed" className="flex-1 rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white transition-colors hover:text-neutral-200">
                                종료 {completedAuctions.length > 0 && <span className="ml-1 text-neutral-500">{completedAuctions.length}</span>}
                            </TabsTrigger>
                        </TabsList>

                        {(user.md_status === 'approved' || user.role === 'admin') && (
                            <Link href="/md/auctions/new">
                                <Button className="rounded-full bg-white text-black font-black hover:bg-neutral-200 shadow-lg h-11 w-11 p-0 flex-shrink-0">
                                    <Plus className="w-5 h-5" />
                                </Button>
                            </Link>
                        )}
                    </div>

                    <div className="mt-4">
                        {/* 오늘의 경매: active + 48시간 내 scheduled */}
                        <TabsContent value="today" className="space-y-4 m-0">
                            {sortedTodayAuctions.length > 0 ? (
                                sortedTodayAuctions.map(auction => (
                                    <MDAuctionCard key={auction.id} auction={auction} onDelete={() => handleAuctionDelete(auction.id)} topBidder={topBids[auction.id]} />
                                ))
                            ) : (
                                <EmptyState label="오늘의 경매가 없습니다." />
                            )}
                        </TabsContent>

                        {/* 종료/정산 */}
                        <TabsContent value="completed" className="space-y-4 m-0">
                            {/* 상태 필터 칩 */}
                            {completedAuctions.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                    {([
                                        { key: "all", label: "전체", count: completedAuctions.length, color: "" },
                                        { key: "action", label: "⚠️ 확인필요", count: actionCount, color: "text-amber-400" },
                                        { key: "done", label: "✅ 완료", count: doneCount, color: "text-green-400" },
                                        { key: "none", label: "유찰/취소", count: noneCount, color: "text-neutral-500" },
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
                            )}

                            {filteredCompleted.length > 0 ? (
                                <>
                                    {recentDates.map(date => (
                                        <DateGroup key={date} date={date} showCount={true}>
                                            {groupedCompleted[date].map(auction => (
                                                <MDAuctionCard key={auction.id} auction={auction} onDelete={() => handleAuctionDelete(auction.id)} />
                                            ))}
                                        </DateGroup>
                                    ))}
                                    {olderDates.length > 0 && (
                                        showOlder ? (
                                            olderDates.map(date => (
                                                <DateGroup key={date} date={date} showCount={true}>
                                                    {groupedCompleted[date].map(auction => (
                                                        <MDAuctionCard key={auction.id} auction={auction} onDelete={() => handleAuctionDelete(auction.id)} />
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
                                    statusFilter === "action" ? "확인 필요한 경매가 없습니다."
                                        : statusFilter === "done" ? "완료된 경매가 없습니다."
                                            : statusFilter === "none" ? "유찰/취소된 경매가 없습니다."
                                                : "종료된 경매가 없습니다."
                                } />
                            )}
                        </TabsContent>
                    </div>
                </Tabs>
            </div>

            {/* Secondary Content: Stats, Navigation, Clubs */}
            <div className="px-6 py-6 space-y-4 text-white">
                {/* Performance Stats */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-[#1C1C1E] to-[#0A0A0A] border-neutral-800 rounded-[28px] p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                        <div className="space-y-1">
                            <p className="text-[11px] font-black text-neutral-500 uppercase tracking-widest">Performance</p>
                            <h2 className="text-[20px] font-black text-white">성과 요약</h2>
                        </div>
                        <TrendingUp className="w-5 h-5 text-green-500" />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-neutral-500">
                                <Plus className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">나의 경매</span>
                            </div>
                            <p className="text-[24px] font-black text-white leading-none">{auctions.length}<span className="text-[12px] text-neutral-500 ml-0.5">건</span></p>
                        </div>
                        <div className="space-y-1.5 border-x border-neutral-800/50 px-4">
                            <div className="flex items-center gap-1.5 text-neutral-500">
                                <Users className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">비딩수</span>
                            </div>
                            <p className="text-[24px] font-black text-white leading-none">
                                {auctions.reduce((acc, a) => acc + a.bid_count, 0)}<span className="text-[12px] text-neutral-500 ml-0.5">회</span>
                            </p>
                        </div>
                        <div className="space-y-1.5 pl-4">
                            <div className="flex items-center gap-1.5 text-neutral-500">
                                <Ticket className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">낙찰건</span>
                            </div>
                            <p className="text-[24px] font-black text-amber-500 leading-none">
                                {auctions.filter(a => ["won", "contacted", "confirmed"].includes(a.status)).length}<span className="text-[12px] text-neutral-500 ml-0.5">건</span>
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Navigation Links */}
                <div className="grid grid-cols-3 gap-3">
                    <Link href="/md/transactions" className="flex-1">
                        <Button variant="outline" className="w-full h-12 bg-[#1C1C1E] border-neutral-800 text-white font-bold gap-2 rounded-2xl hover:bg-neutral-800">
                            <Ticket className="w-4 h-4 text-blue-500" />
                            낙찰 관리
                        </Button>
                    </Link>
                    <Link href="/md/vip" className="flex-1">
                        <Button variant="outline" className="w-full h-12 bg-[#1C1C1E] border-neutral-800 text-white font-bold gap-2 rounded-2xl hover:bg-neutral-800">
                            <Users className="w-4 h-4 text-amber-500" />
                            VIP 고객
                        </Button>
                    </Link>
                    <Link href="/md/settings" className="flex-1">
                        <Button variant="outline" className="w-full h-12 bg-[#1C1C1E] border-neutral-800 text-white font-bold gap-2 rounded-2xl hover:bg-neutral-800">
                            <Settings className="w-4 h-4 text-neutral-400" />
                            프로필 설정
                        </Button>
                    </Link>
                </div>

                {/* Club Management Section - Read Only */}
                <div className="space-y-3 mt-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">나의 클럽 ({clubs.length}개)</h3>
                        <Link href="/md/clubs" className="ml-2">
                            <Button variant="ghost" className="h-8 px-3 text-xs font-bold text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg">
                                <Settings className="w-3.5 h-3.5 mr-1" />
                                관리
                            </Button>
                        </Link>
                    </div>

                    {clubs.length > 0 ? (
                        <div className="space-y-2">
                            {clubs.map((club) => {
                                const isDefault = defaultClubId === club.id;
                                const isApproved = club.status === "approved";

                                return (
                                    <div
                                        key={club.id}
                                        className={`flex items-center gap-3 p-4 bg-[#1C1C1E] rounded-xl transition-colors ${
                                            isDefault ? "border border-amber-500/20" : "border border-neutral-800 hover:border-neutral-700"
                                        }`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-[15px] font-bold text-white truncate">{club.name}</h4>
                                            <p className="text-xs text-neutral-500 flex items-center gap-1 mt-1">
                                                <MapPin className="w-3 h-3" />
                                                {club.area}
                                            </p>
                                        </div>

                                        <div className="shrink-0">
                                            {!isApproved && <StatusBadge status={club.status} size="sm" />}

                                            {isApproved && (
                                                <button
                                                    onClick={() => handleSetDefaultClub(isDefault ? null : club.id)}
                                                    disabled={loading}
                                                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                                                        isDefault
                                                            ? "bg-amber-500/15 text-amber-500"
                                                            : "text-neutral-500 hover:text-neutral-300"
                                                    }`}
                                                >
                                                    {isDefault ? (
                                                        <>
                                                            <CheckCircle className="w-3.5 h-3.5" />
                                                            기본으로 설정됨
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Star className="w-3.5 h-3.5" />
                                                            기본 설정
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-4 px-3 text-center bg-[#1C1C1E]/50 border border-dashed border-neutral-800/50 rounded-xl">
                            <p className="text-xs text-neutral-500">소속 클럽이 아직 신청되지 않았습니다</p>
                            <p className="text-xs text-neutral-600 mt-1">클럽 신청 후 관리자 승인이 필요합니다</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function EmptyState({ label }: { label: string }) {
    return (
        <div className="py-16 text-center space-y-4 bg-[#1C1C1E]/30 rounded-3xl border border-dashed border-neutral-800/50">
            <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
                <TrendingUp className="w-8 h-8 text-neutral-700" />
            </div>
            <p className="text-neutral-500 font-medium text-sm">{label}</p>
            <p className="text-neutral-600 text-xs px-8">
                지금 경매를 등록하면 평균 45분 내에 첫 입찰이 들어옵니다
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
