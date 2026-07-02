"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MDAuctionCard } from "./MDAuctionCard";
import { AcceptedPuzzleVisitCard } from "./AcceptedPuzzleVisitCard";
import { AreaOnboardingSheet } from "./AreaOnboardingSheet";
import dynamic from "next/dynamic";
// 핫딜/게스트간판 매니저는 각각 1000줄 규모 + 토글 시에만 렌더되는 인라인 영역이라
// next/dynamic 으로 분리 — MD 대시보드 진입 시 초기 번들에서 제외, 토글 시점에 로드.
const HotdealNowManager = dynamic(
  () => import("./HotdealNowManager").then((m) => m.HotdealNowManager),
  { loading: () => <div className="animate-pulse bg-neutral-800/50 h-40 rounded-xl" /> }
);
const HotdealSlotBoard = dynamic(
  () => import("./HotdealSlotBoard").then((m) => m.HotdealSlotBoard),
  { loading: () => <div className="animate-pulse bg-neutral-800/50 h-40 rounded-xl" /> }
);
const ShareSlotBoard = dynamic(
  () => import("./ShareSlotBoard").then((m) => m.ShareSlotBoard),
  { loading: () => <div className="animate-pulse bg-neutral-800/50 h-40 rounded-xl" /> }
);
import type { Auction, User, Club, PuzzleOffer, DailyHotdeal, HotdealBenefitsByDow, ShareOption, ShareWeekdayPlan } from "@/types/database";
import { ShareOptionManager } from "@/components/md/ShareOptionManager";
import { ShareWeekdayPlanBoard } from "@/components/md/ShareWeekdayPlanBoard";
import { ShareAuctionGroups } from "@/components/md/ShareAuctionGroups";
import { Plus, TrendingUp, MapPin, ChevronDown, ChevronLeft, Settings, CheckCircle, Trash2, CheckSquare, Square, ExternalLink, Coins, MessageCircle } from "lucide-react";
import { FeatureGate } from "@/components/common/FeatureGate";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { DateGroup } from "@/components/ui/DateGroup";
import dayjs from "dayjs";
import "dayjs/locale/ko";

import { isAuctionExpired, isAuctionActive } from "@/lib/utils/auction";
import { useBidNotification } from "@/hooks/useBidNotification";
import { getErrorMessage, logError } from "@/lib/utils/error";
import { isInstantEnabled } from "@/lib/features";

export interface TopBidInfo {
    bidder_name: string;
    bid_amount: number;
}

interface MDPuzzleOffer extends PuzzleOffer {
    puzzle?: {
        id: string;
        area: string;
        event_date: string;
        total_budget: number | null;
        budget_per_person: number;
        target_count: number;
        current_count: number;
        status: string;
        kakao_open_chat_url: string;
        is_recruiting_party?: boolean;
        leader?: { name?: string; display_name?: string } | null;
    };
    club?: Pick<import("@/types/database").Club, "id" | "name" | "area"> | null;
}

interface HotdealClubLite {
    id: string;
    name: string;
    area: string | null;
    thumbnail_url: string | null;
    floor_plan_url: string | null;
}

interface GuestSignClubLite {
    id: string;
    name: string;
    area: string | null;
    thumbnail_url: string | null;
    /** 대표 테이블맵 1장 (조각 옵션 자리 정보 입력 시 참고용). 없으면 null. */
    floor_plan_url?: string | null;
}

interface GuestSignSlot {
    id: string;
    club_id: string;
    md_id: string;
    week_start: string;
    benefits_by_dow: HotdealBenefitsByDow;
    expires_at: string;
}

interface GuestSignMySlot {
    id: string;
    club_id: string;
    week_start: string;
    benefits_by_dow: HotdealBenefitsByDow;
    expires_at: string;
}

interface ShareSlotLite {
    id: string;
    club_id: string;
    md_id: string;
    week_start: string;
    expires_at: string;
}

interface MDDashboardProps {
    user: User;
    /** 홈 CTA(?section=guestsign/share)로 진입 시 초기 탭 지정 */
    initialSection?: string | null;
    initialAuctions: Auction[];
    initialClubs: Club[];
    initialTopBids?: Record<string, TopBidInfo>;
    initialPuzzleOffers?: MDPuzzleOffer[];
    hotdealClubs?: HotdealClubLite[];
    initialMyHotdeals?: DailyHotdeal[];
    guestSignClubs?: GuestSignClubLite[];
    guestSignSlots?: GuestSignSlot[];
    guestSignMySlots?: GuestSignMySlot[];
    guestSignThisWeekISO?: string;
    guestSignNextWeekISO?: string;
    shareSlotClubs?: GuestSignClubLite[];
    shareSlots?: ShareSlotLite[];
    shareSlotThisWeekISO?: string;
    shareOptions?: ShareOption[];
    shareWeekdayPlans?: ShareWeekdayPlan[];
}

export function MDDashboard({
    user,
    initialSection = null,
    initialAuctions,
    initialClubs,
    initialTopBids = {},
    initialPuzzleOffers = [],
    hotdealClubs = [],
    initialMyHotdeals = [],
    guestSignClubs = [],
    guestSignSlots = [],
    guestSignMySlots = [],
    guestSignThisWeekISO,
    guestSignNextWeekISO,
    shareSlotClubs = [],
    shareSlots = [],
    shareSlotThisWeekISO,
    shareOptions = [],
    shareWeekdayPlans = [],
}: MDDashboardProps) {
    const [auctions, setAuctions] = useState<Auction[]>(initialAuctions);
    const [clubs, setClubs] = useState<Club[]>(initialClubs);
    const [topBids, setTopBids] = useState<Record<string, TopBidInfo>>(initialTopBids);
    const [defaultClubId, setDefaultClubId] = useState<string | null>(user.default_club_id);
    const [loading, setLoading] = useState(false);
    const [clubSheetOpen, setClubSheetOpen] = useState(false);
    const [clubFavCounts, setClubFavCounts] = useState<Record<string, number>>({});
    const [mdCredits, setMdCredits] = useState<number | null>(user.md_credits ?? null);
    const [showAreaOnboarding, setShowAreaOnboarding] = useState(false);
    // prop은 서버 스냅샷이라 markSeen 후에도 갱신 안 됨 → 로컬 상태로 "봤음"을 즉시 반영해 재노출 차단
    const [areaOnboardingSeen, setAreaOnboardingSeen] = useState(user.md_onboarding_areas_seen);
    const [hotdealSheetOpen, setHotdealSheetOpen] = useState(false);
    const [hotdealInlineOpen, setHotdealInlineOpen] = useState(false);
    // 홈 CTA(?section=guestsign / share)로 진입 시 해당 탭을 열어준다.
    const [guestSignSheetOpen, setGuestSignSheetOpen] = useState(false);
    // 조각 UI는 MD 대시보드에서 숨김(유저 주도 조각으로 전환). 기본 열림 탭 = 게스트 간판.
    const [guestSignInlineOpen, setGuestSignInlineOpen] = useState(initialSection !== "hotdeal");
    const [shareInlineOpen, setShareInlineOpen] = useState(false);
    const supabase = createClient();

    // 낙관적 슬롯 상태 — claim 즉시 세팅 영역 표시 (router.refresh() 대기 안 함)
    const [localShareSlots, setLocalShareSlots] = useState(shareSlots);
    const [planBoardResetKey, setPlanBoardResetKey] = useState(0);
    const [activePuzzleTab, setActivePuzzleTab] = useState<"flag" | "share">("flag");
    useEffect(() => { setLocalShareSlots(shareSlots); }, [shareSlots]);

    // 내가 이번 주 선점한 조각 슬롯 — 슬롯이 있어야 조각 등록 가능(등록 버튼 노출 조건)
    const myShareSlots = localShareSlots.filter((s) => s.md_id === user.id);
    const hasShareSlot = myShareSlots.length > 0;

    // 클럽별 이번 주 요일표 세팅 일수 (다음 주 선점 게이트용)
    const shareDaysSetByClub: Record<string, number> = {};
    for (const s of myShareSlots) {
      shareDaysSetByClub[s.club_id] = new Set(
        shareWeekdayPlans.filter((p) => p.club_id === s.club_id).map((p) => p.dow)
      ).size;
    }

    // 관심 지역 온보딩: 승인된 MD가 아직 시트를 안 봤고 구독도 0건이면 노출
    useEffect(() => {
        if (user.role !== "md" && user.role !== "admin") return;
        if (user.md_status !== "approved") return;
        if (areaOnboardingSeen) return;
        let cancelled = false;
        (async () => {
            const { count } = await supabase
                .from("md_puzzle_area_subs")
                .select("id", { count: "exact", head: true })
                .eq("md_id", user.id);
            if (!cancelled && (count ?? 0) === 0) {
                setShowAreaOnboarding(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [user.id, user.role, user.md_status, areaOnboardingSeen, supabase]);

    // 클럽별 찜 수
    useEffect(() => {
        const clubIds = [...new Set(auctions.map(a => a.club_id).filter(Boolean))] as string[];
        if (clubIds.length === 0) return;

        const fetchClubFavCounts = async () => {
            const { data } = await supabase
                .from("user_favorite_clubs")
                .select("club_id")
                .in("club_id", clubIds);

            if (data) {
                const counts: Record<string, number> = {};
                data.forEach((row: { club_id: string }) => {
                    counts[row.club_id] = (counts[row.club_id] || 0) + 1;
                });
                setClubFavCounts(counts);
            }
        };
        fetchClubFavCounts();
    }, [auctions, supabase]);

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

    // 3탭 분류: 오늘특가 / 얼리버드 / 퍼즐 (각 탭이 자기 타입의 종료 경매 포함)
    const completedStatuses = ["won", "unsold", "confirmed", "cancelled"];
    const isCompleted = (a: Auction) =>
        completedStatuses.includes(a.status) ||
        (a.status === "active" && isAuctionExpired(a)) ||
        (a.status === "scheduled" && dayjs().isAfter(dayjs(a.auction_end_at)));

    // 오늘특가: 진행중 + 종료된 instant
    const activeTodayAuctions = auctions.filter(a =>
        a.listing_type === "instant" && !isCompleted(a)
    );
    const completedTodayAuctions = auctions.filter(a =>
        a.listing_type === "instant" && isCompleted(a)
    );

    // 얼리버드: 진행중 + 종료된 auction
    const activeEarlyBirdAuctions = auctions.filter(a =>
        a.listing_type === "auction" && !isCompleted(a)
    );
    // won/contacted는 상단 리스트에 표시, 나머지만 CompletedSection으로
    const actionEarlyBirdAuctions = auctions.filter(a =>
        a.listing_type === "auction" && ["won", "contacted"].includes(a.status)
    );
    const archivedEarlyBirdAuctions = auctions.filter(a =>
        a.listing_type === "auction" && isCompleted(a) && !["won", "contacted"].includes(a.status)
    );

    // 조각: share 타입. 진행 중만 노출하고, 종료된 조각(유찰·취소·낙찰·확정)은
    // 핫딜 만료와 동일하게 목록에서 자동으로 숨긴다 (DB에는 보존).
    // share 조각: share_deadline 기준 마감 — auction_end_at 기반 isCompleted 사용하면 오판.
    // status가 취소/유찰/낙찰/확정인 것만 제외하고 나머지는 모두 노출.
    const shareAuctions = auctions.filter(a =>
      a.listing_type === "share" &&
      !["won", "unsold", "confirmed", "cancelled"].includes(a.status)
    );

    // 오늘특가 정렬: active 먼저 → 마감 임박순
    const sortedTodayAuctions = [...activeTodayAuctions].sort((a, b) => {
        const aActive = isAuctionActive(a) ? 0 : 1;
        const bActive = isAuctionActive(b) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return dayjs(a.extended_end_at || a.auction_end_at).unix() - dayjs(b.extended_end_at || b.auction_end_at).unix();
    });

    // 오늘특가 탭은 instant on이거나 기존 instant 데이터가 있을 때만 노출 (자연 만료 처리)
    const instantEnabled = isInstantEnabled();
    const hasInstantData = activeTodayAuctions.length > 0 || completedTodayAuctions.length > 0;
    const showTodayTab = instantEnabled || hasInstantData;

    // 얼리버드 상단: won/contacted → active → scheduled 순
    const sortedEarlyBirdTop = [...actionEarlyBirdAuctions, ...activeEarlyBirdAuctions].sort((a, b) => {
        const priority = (s: string) => {
            if (s === "won") return 0;
            if (s === "contacted") return 1;
            if (s === "active") return 2;
            if (s === "scheduled") return 3;
            return 4;
        };
        const p = priority(a.status) - priority(b.status);
        if (p !== 0) return p;
        return a.event_date.localeCompare(b.event_date);
    });

    // 내 오퍼 탭: 깃발 / 조각 분리
    const flagOffers = initialPuzzleOffers.filter((o) => !o.puzzle?.is_recruiting_party);
    const shareOffers = initialPuzzleOffers.filter((o) => !!o.puzzle?.is_recruiting_party);
    const tabOffers = activePuzzleTab === "share" ? shareOffers : flagOffers;

    return (
        <div className="max-w-lg mx-auto pb-24 relative">
            {/* 뒤로가기 — 오버레이 */}
            <Link
                href="/"
                aria-label="홈으로"
                className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
                style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
            >
                <ChevronLeft className="w-5 h-5 text-white" />
            </Link>

            {/* Header Profile Section */}
            <div className="pl-14 pr-6 pt-5 pb-4 space-y-4 text-white">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <h1 className="text-xl font-black tracking-tight">{user.display_name || user.name} 파트너님</h1>
                        <p className="text-neutral-500 text-[13px] font-medium">오늘밤도 파이팅이에요!</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/profile" className="flex items-center gap-1.5 text-neutral-500 hover:text-white transition-colors">
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
                                    운영 정책 위반으로 조각 등록이 제한됩니다.
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
            <div className="px-4 pb-2">
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

            {/* 액션 버튼 3종 */}
            <div className="px-4 mt-3 grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setGuestSignInlineOpen((v) => !v);
                        setHotdealInlineOpen(false);
                        setShareInlineOpen(false);
                    }}
                    className={`col-span-1 flex flex-col items-center justify-center gap-1 h-16 bg-[#1C1C1E] border rounded-2xl hover:bg-neutral-800 active:scale-95 transition-all ${
                        guestSignInlineOpen ? "border-amber-500" : "border-neutral-700"
                    }`}
                >
                    <span className="text-[20px] leading-none">🎫</span>
                    <span className="text-[11px] font-black text-white">게스트 간판</span>
                </button>
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setHotdealInlineOpen((v) => !v);
                        setGuestSignInlineOpen(false);
                        setShareInlineOpen(false);
                    }}
                    className={`col-span-1 flex flex-col items-center justify-center gap-1 h-16 bg-[#1C1C1E] border rounded-2xl hover:bg-neutral-800 active:scale-95 transition-all ${
                        hotdealInlineOpen ? "border-amber-500" : "border-neutral-700"
                    }`}
                >
                    <span className="text-[20px] leading-none">🔥</span>
                    <span className="text-[11px] font-black text-white">Hot Deal</span>
                </button>
            </div>

            {/* Hot Deal 인라인 등록 영역 */}
            {hotdealInlineOpen && (
                <div className="px-4 mt-3">
                    <div className="bg-[#1C1C1E] border border-amber-500/30 rounded-2xl p-4">
                        <HotdealNowManager
                            clubs={hotdealClubs}
                            initialMyHotdeals={initialMyHotdeals}
                            embedded
                        />
                    </div>
                </div>
            )}

            {/* 게스트 간판 인라인 영역 */}
            {guestSignInlineOpen && guestSignThisWeekISO && guestSignNextWeekISO && (
                <div className="px-2 mt-3">
                    <div className="bg-[#1C1C1E] border border-amber-500/30 rounded-2xl p-3">
                        <HotdealSlotBoard
                            currentUserId={user.id}
                            isAdmin={user.role === "admin"}
                            clubs={guestSignClubs}
                            slots={guestSignSlots}
                            mySlots={guestSignMySlots}
                            thisWeekISO={guestSignThisWeekISO}
                            nextWeekISO={guestSignNextWeekISO}
                            embedded
                        />
                    </div>
                </div>
            )}

            {/* 조각 인라인 영역 — 자리 선점 + 내 조각 목록 */}
            {shareInlineOpen && (
                <div className="px-2 mt-3 space-y-2">
                    {/* 조각 자리 선점 + 세팅 — 게스트 간판처럼 한 박스 안에서 가로선으로 구분 */}
                    {shareSlotThisWeekISO && (
                        <div className="bg-[#1C1C1E] border border-amber-500/30 rounded-2xl p-3 space-y-3">
                            <ShareSlotBoard
                                currentUserId={user.id}
                                clubs={shareSlotClubs}
                                slots={localShareSlots}
                                thisWeekISO={shareSlotThisWeekISO}
                                embedded
                                isAdmin={user.role === "admin"}
                                onClaim={(slot) => setLocalShareSlots((prev) => [...prev.filter((s) => !(s.club_id === slot.club_id && s.week_start === slot.week_start)), slot])}
                                onRelease={(clubId) => { setLocalShareSlots((prev) => prev.filter((s) => !(s.club_id === clubId && s.md_id === user.id))); setPlanBoardResetKey((k) => k + 1); }}
                                daysSetByClub={shareDaysSetByClub}
                            />

                            {/* 선점 중인 클럽별 프리셋 + 요일표 세팅 (같은 박스, 가로선 구분) */}
                            {myShareSlots.map((slot) => {
                                const club = shareSlotClubs.find((c) => c.id === slot.club_id);
                                const clubOptions = shareOptions.filter((o) => o.club_id === slot.club_id);
                                const clubPlans = shareWeekdayPlans.filter((p) => p.club_id === slot.club_id);
                                return (
                                    <div key={slot.club_id} className="space-y-3">
                                        <div className="border-t border-neutral-800" />
                                        <ShareOptionManager clubId={slot.club_id} options={clubOptions} floorPlanUrl={club?.floor_plan_url ?? null} />
                                        <div className="border-t border-neutral-800" />
                                        <ShareWeekdayPlanBoard key={`${slot.club_id}-${planBoardResetKey}`} clubId={slot.club_id} options={clubOptions} plans={clubPlans} />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* 내 조각 목록 — 슬롯 보유 시에만 노출 */}
                    {hasShareSlot && (
                        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-3 space-y-2">
                            <p className="text-[13px] font-black text-white">내 조각</p>
                            {shareAuctions.length > 0 ? (
                                <ShareAuctionGroups
                                    auctions={shareAuctions}
                                    onDelete={handleAuctionDelete}
                                    clubFavCounts={clubFavCounts}
                                />
                            ) : !user.kakao_open_chat_url ? (
                                <div className="flex flex-col items-center justify-center py-5 text-center space-y-2">
                                    <p className="text-2xl">💬</p>
                                    <p className="text-white text-[13px] font-black">오픈채팅 URL을 먼저 등록해주세요</p>
                                    <p className="text-neutral-500 text-[11px]">조각 생성에 오픈채팅이 필요해요</p>
                                    <a href="/profile" className="mt-1 px-4 py-1.5 rounded-full bg-amber-500 text-black text-[12px] font-black">프로필 설정</a>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-5 text-center space-y-1.5">
                                    <p className="text-2xl">🧩</p>
                                    <p className="text-neutral-400 text-[13px] font-medium">요일을 켜면 조각이 자동 생성돼요</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Auction Tabs + Register Button */}
            <div className="px-4 mt-3">
                <Tabs value={activePuzzleTab} onValueChange={(v) => setActivePuzzleTab(v as "flag" | "share")} className="w-full">
                    <div className="flex items-center gap-2">
                        <TabsList className="flex-1 bg-neutral-900 border border-neutral-800/50 h-11 p-1 rounded-xl">
                            <TabsTrigger value="flag" className="flex-1 rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white transition-colors hover:text-neutral-200 text-[13px]">
                                ⛳ 깃발 {flagOffers.length > 0 && <span className="ml-0.5 text-amber-400">{flagOffers.length}</span>}
                            </TabsTrigger>
                            <TabsTrigger value="share" className="flex-1 rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white transition-colors hover:text-neutral-200 text-[13px]">
                                🧩 조각 {shareOffers.length > 0 && <span className="ml-0.5 text-green-400">{shareOffers.length}</span>}
                            </TabsTrigger>
                        </TabsList>

                    </div>

                    <div className="mt-4">
                        {/* 오늘특가: 진행중 instant + 하단 종료 instant (탭이 노출될 때만 렌더) */}
                        {showTodayTab && (
                            <TabsContent value="today" className="space-y-4 m-0">
                                {sortedTodayAuctions.length > 0 ? (
                                    sortedTodayAuctions.map(auction => (
                                        <MDAuctionCard key={auction.id} auction={auction} onDelete={() => handleAuctionDelete(auction.id)} topBidder={topBids[auction.id]} favoriteCount={clubFavCounts[auction.club_id || ""] || 0} />
                                    ))
                                ) : (
                                    <EmptyState label="진행 중인 특가 경매가 없습니다." />
                                )}
                                {completedTodayAuctions.length > 0 && (
                                    <CompletedSection auctions={completedTodayAuctions} onDelete={handleAuctionDelete} clubFavCounts={clubFavCounts} />
                                )}
                            </TabsContent>
                        )}

                        {/* 얼리버드: won/contacted 상단 + active/scheduled + 하단 종료 */}
                        <TabsContent value="earlybird" className="space-y-4 m-0">
                            {sortedEarlyBirdTop.length > 0 ? (
                                sortedEarlyBirdTop.map(auction => (
                                    <MDAuctionCard key={auction.id} auction={auction} onDelete={() => handleAuctionDelete(auction.id)} topBidder={topBids[auction.id]} favoriteCount={clubFavCounts[auction.club_id || ""] || 0} />
                                ))
                            ) : (
                                <EmptyState
                                    label="얼리버드 경매가 없습니다."
                                    description={<>오래 노출될수록 입찰 경쟁은 뜨거워집니다.<br/>주요 일정을 미리 올려 더 높은 낙찰가를 확보해 보세요.</>}
                                />
                            )}
                            {archivedEarlyBirdAuctions.length > 0 && (
                                <CompletedSection auctions={archivedEarlyBirdAuctions} onDelete={handleAuctionDelete} clubFavCounts={clubFavCounts} />
                            )}
                        </TabsContent>

                        {/* 퍼즐 오퍼 */}
                        <TabsContent value={activePuzzleTab} className="space-y-3 m-0">
                            {/* 거래 확정 — 이벤트 지난 accepted 오퍼 (확정 안된 것 + 응답 대기 + 응답 차례) */}
                            {(() => {
                                const today = new Date().toISOString().split("T")[0];
                                const pendingVisit = tabOffers.filter(o =>
                                    o.status === "accepted" &&
                                    o.puzzle?.event_date &&
                                    o.puzzle.event_date < today &&
                                    !o.visit_marked_at
                                );
                                if (pendingVisit.length === 0) return null;
                                return (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 px-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                            <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                                                거래 확정 ({pendingVisit.length})
                                            </span>
                                        </div>
                                        {pendingVisit.map(offer => (
                                            <AcceptedPuzzleVisitCard
                                                key={offer.id}
                                                offer={{
                                                    id: offer.id,
                                                    proposed_price: offer.proposed_price,
                                                    table_type: offer.table_type,
                                                    visit_marked_at: offer.visit_marked_at,
                                                    puzzle: offer.puzzle ? {
                                                        id: offer.puzzle.id,
                                                        area: offer.puzzle.area,
                                                        event_date: offer.puzzle.event_date,
                                                        leader: offer.puzzle.leader,
                                                    } : null,
                                                    club: offer.club,
                                                }}
                                            />
                                        ))}
                                        <div className="border-b border-neutral-800/40 my-1" />
                                    </div>
                                );
                            })()}
                            {tabOffers.filter(o =>
                                !(o.status === "accepted" && o.puzzle?.event_date && o.puzzle.event_date < new Date().toISOString().split("T")[0] && !o.visit_marked_at)
                            ).length > 0 ? (
                                tabOffers.filter(o =>
                                    !(o.status === "accepted" && o.puzzle?.event_date && o.puzzle.event_date < new Date().toISOString().split("T")[0] && !o.visit_marked_at)
                                ).map(offer => {
                                    const p = offer.puzzle;
                                    if (!p) return null;
                                    const isAccepted = offer.status === "accepted";
                                    const isShare = !!p.is_recruiting_party;
                                    const budget = p.total_budget ?? p.budget_per_person * p.target_count;
                                    const eventDateStr = (() => {
                                        const d = new Date(p.event_date + "T00:00:00");
                                        const days = ["일", "월", "화", "수", "목", "금", "토"];
                                        return `${d.getMonth() + 1}/${d.getDate()} ${days[d.getDay()]}`;
                                    })();

                                    return (
                                        <Card key={offer.id} className={`overflow-hidden bg-[#1C1C1E] border-neutral-800/50 hover:border-neutral-700 transition-all p-3 cursor-pointer active:scale-[0.98] ${
                                            isAccepted ? "border-green-500/30" : ""
                                        }`}>
                                            <Link href={`/flags/${p.id}`} className="block">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            <span className={`text-[9px] font-bold px-1.5 py-0 h-4 inline-flex items-center rounded-full ${
                                                                isAccepted
                                                                    ? "bg-green-500/20 text-green-400"
                                                                    : "bg-amber-500/20 text-amber-400"
                                                            }`}>
                                                                {isAccepted ? "매치됨" : "대기중"}
                                                            </span>
                                                        </div>
                                                        <h3 className="font-black text-[18px] text-white truncate leading-tight">
                                                            {p.area} · {eventDateStr}
                                                        </h3>
                                                    </div>
                                                    </div>

                                                <div className="flex items-end justify-between mt-1">
                                                    <div>
                                                        <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">제안가</div>
                                                        <div className="flex items-baseline gap-1">
                                                            <span className="text-[20px] font-black text-white leading-none">{offer.proposed_price.toLocaleString()}</span>
                                                            <span className="text-[12px] font-bold text-neutral-400">원</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">예산</div>
                                                        <span className="text-[14px] font-bold text-neutral-300">{budget.toLocaleString()}원 · {p.target_count}명</span>
                                                    </div>
                                                </div>

                                                {/* 제안 상세 — 조각은 인원·가격 변동이라 주류/구성 무의미 → 숨김 */}
                                                {!isShare && (
                                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                    <span className="text-[11px] font-bold text-neutral-300 bg-neutral-800 px-2 py-0.5 rounded">{offer.table_type}</span>
                                                    {offer.includes?.slice(0, 3).map((item: string) => (
                                                        <span key={item} className="text-[11px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">{item}</span>
                                                    ))}
                                                    {offer.includes?.length > 3 && (
                                                        <span className="text-[11px] text-neutral-500">+{offer.includes.length - 3}</span>
                                                    )}
                                                </div>
                                                )}
                                            </Link>

                                            {/* Footer */}
                                            <div className="mt-2 pt-2 border-t border-neutral-800/60 flex items-center justify-end">
                                                {isAccepted ? (
                                                    <FeatureGate
                                                        flag="offer_chat"
                                                        fallback={
                                                            <a
                                                                href={p.kakao_open_chat_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="h-8 px-3 rounded-lg bg-[#FEE500] text-[#3C1E1E] font-black text-[13px] inline-flex items-center gap-1.5 hover:bg-[#FDD835] transition-colors"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                                오픈채팅 연락
                                                            </a>
                                                        }
                                                    >
                                                        <Link
                                                            href={`/messages/${offer.id}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="h-8 px-3 rounded-lg bg-white text-black font-black text-[13px] inline-flex items-center gap-1.5 hover:bg-neutral-200 transition-colors"
                                                        >
                                                            <MessageCircle className="w-3.5 h-3.5" />
                                                            채팅
                                                        </Link>
                                                    </FeatureGate>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (!confirm("이 제안을 철회하시겠습니까?")) return;
                                                            (async () => {
                                                                const supabase = createClient();
                                                                const { data, error } = await supabase.rpc("withdraw_offer", { p_offer_id: offer.id });
                                                                if (error || !data?.success) {
                                                                    toast.error(data?.error || "철회에 실패했습니다");
                                                                    return;
                                                                }
                                                                toast.success("오퍼가 철회됐습니다");
                                                                window.location.reload();
                                                            })();
                                                        }}
                                                        className="h-8 px-3 rounded-lg bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-400"
                                                    >
                                                        철회
                                                    </Button>
                                                )}
                                            </div>
                                        </Card>
                                    );
                                })
                            ) : tabOffers.length === 0 ? (
                                <div className="py-16 text-center space-y-4 bg-[#1C1C1E]/30 rounded-3xl border border-dashed border-neutral-800/50">
                                    <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto text-3xl">
                                        📨
                                    </div>
                                    <p className="text-neutral-500 font-medium text-sm">{activePuzzleTab === "share" ? "보낸 조각 오퍼가 없습니다" : "보낸 깃발 오퍼가 없습니다"}</p>
                                    <p className="text-neutral-600 text-xs px-10 leading-relaxed">
                                        {activePuzzleTab === "share"
                                            ? <>홈 조각 탭에서 유저들이 올린 조각을 확인하고<br/>오퍼를 보내보세요</>
                                            : <>홈에서 유저들이 꽂은 깃발을 확인하고<br/>제안을 보내보세요</>}
                                    </p>
                                    <Link href={activePuzzleTab === "share" ? "/?tab=share" : "/?tab=puzzle"}>
                                        <Button className="rounded-full bg-white text-black font-black hover:bg-neutral-200 h-10 px-6 mt-2">
                                            <span className="mr-1">{activePuzzleTab === "share" ? "🧩" : "⛳"}</span>
                                            둘러보기
                                        </Button>
                                    </Link>
                                </div>
                            ) : null}
                        </TabsContent>

                    </div>
                </Tabs>
            </div>

            {/* Secondary Content: Stats */}
            <div className="px-6 py-6 space-y-4 text-white">
                {/* 크레딧 — 보유/충전 동선만 노출 (성과 통계는 제거) */}
                <Link
                    href="/md/credits"
                    className="flex items-center justify-between rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3.5 group hover:bg-amber-500/[0.12] transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/15">
                            <Coins className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="space-y-0.5">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500">보유 크레딧</span>
                            <p className={`text-[22px] font-black leading-none ${mdCredits !== null && mdCredits < 30 ? "text-red-400" : "text-amber-400"}`}>
                                {mdCredits ?? "—"}<span className="text-[12px] text-neutral-500 ml-0.5">크레딧</span>
                            </p>
                        </div>
                    </div>
                    <span className="flex items-center gap-1 rounded-full bg-amber-500 px-4 py-2 text-[13px] font-black text-black group-hover:bg-amber-400 transition-colors">
                        <Plus className="w-4 h-4" />충전
                    </span>
                </Link>
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

            {showAreaOnboarding && (
                <AreaOnboardingSheet
                    userId={user.id}
                    onClose={() => {
                        setAreaOnboardingSeen(true);
                        setShowAreaOnboarding(false);
                    }}
                />
            )}

            {/* Hot Deal 등록 Sheet (페이지 이동 없이 대시보드 내에서 열림) */}
            <Sheet open={hotdealSheetOpen} onOpenChange={setHotdealSheetOpen}>
                <SheetContent
                    side="bottom"
                    className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl !h-[92vh] !max-h-[92vh] !gap-0 !p-0 !flex !flex-col"
                    showCloseButton
                >
                    <SheetHeader className="sr-only">
                        <SheetTitle>Hot Deal 등록</SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-6 pb-12">
                        <HotdealNowManager
                            clubs={hotdealClubs}
                            initialMyHotdeals={initialMyHotdeals}
                            embedded
                        />
                    </div>
                </SheetContent>
            </Sheet>

            {/* 게스트 간판 Sheet */}
            <Sheet open={guestSignSheetOpen} onOpenChange={setGuestSignSheetOpen}>
                <SheetContent
                    side="bottom"
                    className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl !h-[92vh] !max-h-[92vh] !gap-0 !p-0 !flex !flex-col"
                    showCloseButton
                >
                    <SheetHeader className="sr-only">
                        <SheetTitle>게스트 간판</SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-6 pb-12">
                        {guestSignThisWeekISO && guestSignNextWeekISO && (
                            <HotdealSlotBoard
                                currentUserId={user.id}
                                isAdmin={user.role === "admin"}
                                clubs={guestSignClubs}
                                slots={guestSignSlots}
                                mySlots={guestSignMySlots}
                                thisWeekISO={guestSignThisWeekISO}
                                nextWeekISO={guestSignNextWeekISO}
                                embedded
                            />
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

function CompletedSection({ auctions, onDelete, clubFavCounts = {} }: { auctions: Auction[]; onDelete: (id: string) => void; clubFavCounts?: Record<string, number> }) {
    const [statusFilter, setStatusFilter] = useState<"all" | "done" | "none">("all");
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [showOlder, setShowOlder] = useState(false);

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
            [...selectedIds].forEach(id => onDelete(id));
            toast.success(`${selectedIds.size}건 삭제되었습니다.`);
            setSelectedIds(new Set());
            setSelectMode(false);
        } catch {
            toast.error("일부 항목 삭제에 실패했습니다.");
        } finally {
            setBulkDeleting(false);
        }
    };

    const getPriority = (status: string) => {
        switch (status) {
            case "won": return 1;
            case "confirmed": return 2;
            case "unsold": return 3;
            case "cancelled": return 4;
            default: return 5;
        }
    };

    const doneCount = auctions.filter(a => a.status === "confirmed").length;
    const noneCount = auctions.filter(a => ["unsold", "cancelled"].includes(a.status)).length;

    const filtered = statusFilter === "all"
        ? auctions
        : statusFilter === "done"
            ? auctions.filter(a => a.status === "confirmed")
            : auctions.filter(a => ["unsold", "cancelled"].includes(a.status));

    const sorted = [...filtered].sort((a, b) => {
        const priorityDiff = getPriority(a.status) - getPriority(b.status);
        if (priorityDiff !== 0) return priorityDiff;
        return b.event_date.localeCompare(a.event_date);
    });

    const grouped = sorted.reduce((groups, auction) => {
        const date = auction.event_date;
        if (!groups[date]) groups[date] = [];
        groups[date].push(auction);
        return groups;
    }, {} as Record<string, Auction[]>);

    const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    const recentDates = dates.slice(0, 7);
    const olderDates = dates.slice(7);
    const olderCount = olderDates.reduce((sum, d) => sum + grouped[d].length, 0);

    const renderAuctionItem = (auction: Auction) => (
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
                <MDAuctionCard auction={auction} onDelete={() => onDelete(auction.id)} favoriteCount={clubFavCounts[auction.club_id || ""] || 0} />
            </div>
        </div>
    );

    return (
        <>
            {/* 구분선 */}
            <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 h-px bg-neutral-800" />
                <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">종료 {auctions.length}건</span>
                <div className="flex-1 h-px bg-neutral-800" />
            </div>

            {/* 필터 칩 + 선택 모드 토글 */}
            <div className="flex items-center gap-2">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
                    {([
                        { key: "all" as const, label: "전체", count: auctions.length, color: "" },
                        { key: "done" as const, label: "✅ 판매완료", count: doneCount, color: "text-green-400" },
                        { key: "none" as const, label: "유찰", count: noneCount, color: "text-neutral-500" },
                    ]).map(chip => (
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
                        onClick={() => toggleSelectAll(filtered.map(a => a.id))}
                        className="flex items-center gap-2 text-[13px] font-bold text-neutral-300"
                    >
                        {filtered.every(a => selectedIds.has(a.id))
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

            {/* 일별 그룹핑된 경매 목록 */}
            {filtered.length > 0 ? (
                <>
                    {recentDates.map(date => (
                        <DateGroup key={date} date={date} showCount={true}>
                            {grouped[date].map(renderAuctionItem)}
                        </DateGroup>
                    ))}
                    {olderDates.length > 0 && (
                        showOlder ? (
                            olderDates.map(date => (
                                <DateGroup key={date} date={date} showCount={true}>
                                    {grouped[date].map(renderAuctionItem)}
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
                <div className="py-8 text-center">
                    <p className="text-neutral-600 text-sm">
                        {statusFilter === "done" ? "완료된 경매가 없습니다."
                            : statusFilter === "none" ? "유찰된 경매가 없습니다."
                                : "종료된 경매가 없습니다."}
                    </p>
                </div>
            )}
        </>
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
                    조각 등록하기
                </Button>
            </Link>
        </div>
    );
}
