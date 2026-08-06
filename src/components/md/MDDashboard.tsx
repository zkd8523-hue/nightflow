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
  { loading: () => <div className="animate-pulse bg-muted/50 h-40 rounded-xl" /> }
);
const HotdealSlotBoard = dynamic(
  () => import("./HotdealSlotBoard").then((m) => m.HotdealSlotBoard),
  { loading: () => <div className="animate-pulse bg-muted/50 h-40 rounded-xl" /> }
);
const ShareSlotBoard = dynamic(
  () => import("./ShareSlotBoard").then((m) => m.ShareSlotBoard),
  { loading: () => <div className="animate-pulse bg-muted/50 h-40 rounded-xl" /> }
);
import type { Auction, User, Club, PuzzleOffer, DailyHotdeal, HotdealBenefitsByDow, ShareOption, ShareWeekdayPlan } from "@/types/database";
import { ShareOptionManager } from "@/components/md/ShareOptionManager";
import { ShareWeekdayPlanBoard } from "@/components/md/ShareWeekdayPlanBoard";
import { ShareAuctionGroups } from "@/components/md/ShareAuctionGroups";
import { ShareLiveToggleList } from "@/components/md/ShareLiveToggleList";
import { Plus, Minus, TrendingUp, MapPin, ChevronDown, ChevronLeft, Settings, CheckCircle, Trash2, CheckSquare, Square, ExternalLink, Coins, MessageCircle, Pencil } from "lucide-react";
import { FeatureGate } from "@/components/common/FeatureGate";
import { toast } from "sonner";
import { getDDayLabel, formatGenderComposition } from "@/lib/utils/format";

import { createClient } from "@/lib/supabase/client";
import { CreditHistory } from "@/components/md/CreditHistory";
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
        notes?: string | null;
        area: string;
        event_date: string;
        total_budget: number | null;
        budget_per_person: number;
        target_count: number;
        current_count: number;
        target_male?: number | null;
        target_female?: number | null;
        status: string;
        kakao_open_chat_url: string;
        is_recruiting_party?: boolean;
        leader?: { name?: string; display_name?: string } | null;
    };
    club?: Pick<import("@/types/database").Club, "id" | "name" | "area" | "drink_menu_url" | "drink_menu_urls" | "drink_menu_updated_at"> | null;
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

// 헤더 인사 문구 — 마운트 후 랜덤 선택(SSR/CSR 텍스트 불일치 방지를 위해 useEffect에서 교체)
const HEADER_GREETINGS = [
    "오늘밤도 파이팅이에요!",
    "오늘도 좋은 손님 가득하길!",
    "오늘 매출 대박나세요!",
    "즐거운 영업 되세요!",
    "오늘도 화이팅입니다!",
];

interface MDDashboardProps {
    user: User;
    /** 홈 CTA(?section=guestsign/share)로 진입 시 초기 탭 지정 */
    initialSection?: string | null;
    initialAuctions: Auction[];
    initialClubs: Club[];
    initialTopBids?: Record<string, TopBidInfo>;
    initialPuzzleOffers?: MDPuzzleOffer[];
    /** leader_chat_started_at 오퍼 중 MD 본인이 이미 답장한 오퍼 id 목록 */
    mdRepliedOfferIds?: string[];
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
    mdRepliedOfferIds = [],
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
    // 헤더 인사 문구 — 서버 렌더와 동일하게 시작 후, 마운트 시 클라이언트에서만 랜덤 교체
    const [headerGreeting, setHeaderGreeting] = useState(HEADER_GREETINGS[0]);
    useEffect(() => {
        setHeaderGreeting(HEADER_GREETINGS[Math.floor(Math.random() * HEADER_GREETINGS.length)]);
    }, []);
    // 내 오퍼 카드의 "..." 수정/삭제 메뉴 — 한 번에 하나만 열림
    const [openOfferMenuId, setOpenOfferMenuId] = useState<string | null>(null);
    // 내 오퍼 카드의 세부사항(오퍼 금액·구성·코멘트) 드롭다운 — 한 번에 하나만 열림
    const [openOfferDetailsId, setOpenOfferDetailsId] = useState<string | null>(null);
    // prop은 서버 스냅샷이라 markSeen 후에도 갱신 안 됨 → 로컬 상태로 "봤음"을 즉시 반영해 재노출 차단
    const [areaOnboardingSeen, setAreaOnboardingSeen] = useState(user.md_onboarding_areas_seen);
    const [hotdealSheetOpen, setHotdealSheetOpen] = useState(false);
    const [hotdealInlineOpen, setHotdealInlineOpen] = useState(false);
    // 홈 CTA(?section=guestsign / share)로 진입 시 해당 탭을 열어준다.
    const [guestSignSheetOpen, setGuestSignSheetOpen] = useState(false);
    // 소속 클럽의 이번 주 게스트 간판이 비어있는지(=차지 안 됐고, 차지 가능한 클럽이 있는지).
    // props(서버 스냅샷)만으로 계산되는 순수값이라 매 렌더 재계산해도 무해함.
    const guestSignClaimedClubIds = new Set(
        guestSignSlots.filter((s) => s.week_start === guestSignThisWeekISO).map((s) => s.club_id)
    );
    const guestSignMineThisWeek = guestSignMySlots.some((s) => s.week_start === guestSignThisWeekISO);
    const guestSignUnclaimedThisWeek =
        !guestSignMineThisWeek && guestSignClubs.some((c) => !guestSignClaimedClubIds.has(c.id));

    // 게스트 간판 탭 초기 펼침 규칙:
    //  1) 홈 CTA(?section=...)로 명시 진입 시 → 해당 섹션만 존중
    //  2) 그냥 대시보드 진입인데 이번주 게스트 간판이 비어있으면(참여 유도) → 자동 펼침
    const [guestSignInlineOpen, setGuestSignInlineOpen] = useState(() =>
        initialSection ? initialSection === "guestsign" : guestSignUnclaimedThisWeek
    );
    const [shareInlineOpen, setShareInlineOpen] = useState(false);
    const supabase = createClient();

    // 낙관적 슬롯 상태 — claim 즉시 세팅 영역 표시 (router.refresh() 대기 안 함)
    const [localShareSlots, setLocalShareSlots] = useState(shareSlots);
    const [planBoardResetKey, setPlanBoardResetKey] = useState(0);
    // "all" = 아무 탭도 선택 안 한 기본 상태(깃발+조각 전체). 같은 탭을 다시 누르면 "all"로 돌아감.
    // ?tab=share/flag 로 들어오면 그 탭이 켜진 채 시작 (조각 상세 → "대시보드로 이동" 등)
    const initialPuzzleTab = ((): "flag" | "share" | "all" => {
        if (typeof window === "undefined") return "all";
        const t = new URLSearchParams(window.location.search).get("tab");
        return t === "share" || t === "flag" ? t : "all";
    })();
    const [activePuzzleTab, setActivePuzzleTab] = useState<"flag" | "share" | "all">(initialPuzzleTab);
    // MD 직통 조각(내 조각) — host_is_md 퍼즐. 조각 인라인 "내 조각" 목록용.
    // Migration 505: D-7 자동 발행이 붙으면서 세팅당 하루 1건씩 쌓이므로
    // event_date >= 오늘로 잘라 "진행 중"만 남긴다(과거는 별도 지난 조각으로).
    const [myShares, setMyShares] = useState<Array<{ id: string; notes: string | null; area: string; event_date: string; current_count: number; target_count: number; status: string; source_template_id: string | null }>>([]);
    const todayKstStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from("puzzles")
                .select("id, notes, area, event_date, current_count, target_count, status, source_template_id")
                .eq("leader_id", user.id)
                .eq("host_is_md", true)
                .neq("status", "cancelled")
                .eq("hidden_by_host", false)
                .gte("event_date", todayKstStr)
                .order("event_date", { ascending: true });
            if (data) setMyShares(data);
        })();
    }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // 날짜별 그룹핑 — 오늘/내일은 기본 펼침, 나머지는 접힘(자동 발행분 폭증 대비)
    const myShareGroups = useMemo(() => {
        const map = new Map<string, typeof myShares>();
        myShares.forEach((s) => {
            const arr = map.get(s.event_date) ?? [];
            arr.push(s);
            map.set(s.event_date, arr);
        });
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [myShares]);
    const tomorrowKstStr = new Date(Date.now() + 9 * 60 * 60 * 1000 + 86400000).toISOString().slice(0, 10);
    const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
    const isCollapsed = (date: string) =>
        collapsedDates.has(date) || (date !== todayKstStr && date !== tomorrowKstStr && !collapsedDates.has(`open:${date}`));
    const toggleDateCollapse = (date: string, currentlyCollapsed: boolean) => {
        setCollapsedDates((prev) => {
            const next = new Set(prev);
            if (currentlyCollapsed) { next.delete(date); next.add(`open:${date}`); }
            else { next.add(date); next.delete(`open:${date}`); }
            return next;
        });
    };
    const shareDateLabel = (date: string) => {
        const d = new Date(date + "T00:00:00+09:00");
        const days = ["일", "월", "화", "수", "목", "금", "토"];
        const base = `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
        if (date === todayKstStr) return `오늘 ${base}`;
        if (date === tomorrowKstStr) return `내일 ${base}`;
        return base;
    };
    // 내 조각 인원 수정(외부 인원 +/-) — 누적 후 "적용"으로 반영
    const [shareCounts, setShareCounts] = useState<Record<string, number>>({});
    const [shareDeltas, setShareDeltas] = useState<Record<string, number>>({});
    const [shareSaving, setShareSaving] = useState<string | null>(null);
    const applyShare = async (puzzleId: string) => {
        const delta = shareDeltas[puzzleId] ?? 0;
        if (shareSaving || delta === 0) return;
        setShareSaving(puzzleId);
        const { data } = await supabase.rpc("adjust_share_host_external", { p_puzzle_id: puzzleId, p_delta: delta });
        setShareSaving(null);
        if (data?.success) {
            setShareCounts((m) => ({ ...m, [puzzleId]: data.current_count }));
            setShareDeltas((m) => ({ ...m, [puzzleId]: 0 }));
        } else if (data?.error) toast.error(data.error);
    };
    // 내 조각 삭제(내리기) — 상세페이지 handleCancelWithReason과 동일한 RPC 재사용
    const [shareDeleting, setShareDeleting] = useState<string | null>(null);
    const deleteShare = async (puzzleId: string, status: string) => {
        if (!confirm("이 파티를 내리시겠어요?")) return;
        setShareDeleting(puzzleId);
        // open 조각: 정식 취소(참여자 알림 + 오퍼 만료). 종료된 조각(만료/성사 등): 목록에서 숨김만.
        const { data, error } = status === "open"
            ? await supabase.rpc("cancel_puzzle_with_reason", {
                p_puzzle_id: puzzleId,
                p_reasons: ["other"],
                p_reason_text: "MD 대시보드에서 삭제",
              })
            : await supabase.rpc("md_hide_share", { p_puzzle_id: puzzleId });
        setShareDeleting(null);
        if (error || !data?.success) {
            toast.error((data?.error || "삭제에 실패했습니다").replace("깃발", "파티"));
            return;
        }
        setMyShares((prev) => prev.filter((s) => s.id !== puzzleId));
        toast.success("파티를 내렸어요");
    };
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
    // "all"(미선택) 상태에서는 리스트를 아예 노출하지 않음 — 깃발/조각 중 하나를 골라야 목록이 뜬다.
    const tabOffers = activePuzzleTab === "share" ? shareOffers : activePuzzleTab === "flag" ? flagOffers : [];
    // 거래 확정 카드(위 섹션)로 빠진 것 제외 — 날짜 헤더 그룹핑용으로 목록을 한 번만 계산
    const visibleOffers = tabOffers.filter(o =>
        !(o.status === "accepted" && o.puzzle?.event_date && o.puzzle.event_date < new Date().toISOString().split("T")[0] && !o.visit_marked_at)
    );
    const mdRepliedOfferIdSet = useMemo(() => new Set(mdRepliedOfferIds), [mdRepliedOfferIds]);

    return (
        <div className="max-w-lg mx-auto pb-24 relative">
            {/* 뒤로가기 — 오버레이 */}
            <Link
                href="/"
                aria-label="홈으로"
                className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
                style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
            >
                <ChevronLeft className="w-5 h-5 text-foreground" />
            </Link>

            {/* Header Profile Section */}
            <div className="pl-14 pr-6 pt-5 pb-4 space-y-4 text-foreground">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <h1 className="text-xl font-black tracking-tight">{user.display_name || user.name} 파트너님</h1>
                        <p className="text-muted-foreground text-[13px] font-medium">{headerGreeting}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/profile" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
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
                                    운영 정책 위반으로 파티 등록이 제한됩니다.
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
                        <div className="flex items-center gap-2 px-4 py-3 bg-card border border-dashed border-border rounded-2xl">
                            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-[13px] text-muted-foreground font-medium">클럽을 등록해주세요</span>
                            <Plus className="w-4 h-4 text-muted-foreground ml-auto" />
                        </div>
                    </Link>
                ) : clubs.length === 1 ? (
                    <div className="flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-lg">
                        <MapPin className="w-4 h-4 text-brand-amber shrink-0" />
                        <span className="text-[14px] font-bold text-foreground truncate">{clubs[0].name}</span>
                        <span className="text-muted-foreground text-[13px]">&middot;</span>
                        <span className="text-[13px] text-muted-foreground">{clubs[0].area}</span>
                        <Link href="/md/clubs" className="ml-auto">
                            <Button variant="ghost" className="h-7 px-2 text-[11px] font-bold text-muted-foreground hover:text-foreground rounded-lg whitespace-nowrap">
                                클럽 관리
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <button
                        onClick={() => setClubSheetOpen(true)}
                        className="w-full flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-2xl hover:border-border transition-colors text-left"
                    >
                        <MapPin className="w-4 h-4 text-brand-amber shrink-0" />
                        {activeClub ? (
                            <>
                                <span className="text-[14px] font-bold text-foreground truncate">{activeClub.name}</span>
                                <span className="text-muted-foreground text-[13px]">&middot;</span>
                                <span className="text-[13px] text-muted-foreground">{activeClub.area}</span>
                            </>
                        ) : (
                            <span className="text-[13px] text-muted-foreground">클럽을 선택해주세요</span>
                        )}
                        <div className="flex items-center gap-1 ml-auto shrink-0">
                            {defaultClubId && <span className="text-[11px] text-muted-foreground font-medium">기본 클럽</span>}
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        </div>
                    </button>
                )}
            </div>

            {/* 액션 버튼 3종 — 바깥 테두리에 "파트너 도구" 레전드(fieldset legend 스타일)로 라벨링 */}
            <div className="px-4 mt-5 relative">
                <div className="border border-border rounded-xl p-2 pt-4 space-y-2">
                    {/* 게스트 간판 — 전체 너비 한 줄 */}
                    <button
                        type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setGuestSignInlineOpen((v) => !v);
                        setHotdealInlineOpen(false);
                        setShareInlineOpen(false);
                    }}
                    className={`w-full flex flex-row items-center justify-center gap-1.5 h-14 bg-card border rounded-2xl hover:bg-muted active:scale-95 transition-all ${
                        guestSignInlineOpen ? "border-amber-500" : "border-border"
                    }`}
                >
                    <span className="text-[18px] leading-none">🎫</span>
                    <span className="text-[12px] font-black text-foreground">게스트 간판</span>
                    <span className="text-[12px] font-bold text-muted-foreground">(매주 월 18시 오픈)</span>
                </button>
                {/* 파티 | 핫딜 — 반반 */}
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShareInlineOpen((v) => !v);
                            setGuestSignInlineOpen(false);
                            setHotdealInlineOpen(false);
                        }}
                        className={`col-span-1 flex flex-col items-center justify-center gap-1 h-16 bg-card border rounded-2xl hover:bg-muted active:scale-95 transition-all ${
                            shareInlineOpen ? "border-green-500" : "border-border"
                        }`}
                    >
                        <span className="text-[20px] leading-none">🎉</span>
                        <span className="text-[12px] font-black text-foreground">파티</span>
                        {/* 파티 운영권도 게스트 간판과 같은 주 단위 선점(Migration 514) */}
                        <span className="text-[10.5px] font-bold text-muted-foreground leading-none">(매주 월 18시 오픈)</span>
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
                        className={`col-span-1 flex flex-col items-center justify-center gap-1 h-16 bg-card border rounded-2xl hover:bg-muted active:scale-95 transition-all ${
                            hotdealInlineOpen ? "border-amber-500" : "border-border"
                        }`}
                    >
                        <span className="text-[20px] leading-none">🔥</span>
                        <span className="text-[12px] font-black text-foreground">핫딜</span>
                    </button>
                </div>
                </div>
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 bg-background text-[12px] font-black text-muted-foreground whitespace-nowrap">
                    파트너 도구
                </span>
            </div>

            {/* Hot Deal 인라인 등록 영역 */}
            {hotdealInlineOpen && (
                <div className="px-4 mt-3">
                    <div className="bg-card border border-amber-500/30 rounded-2xl p-4">
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
                    <div className="bg-card border border-amber-500/30 rounded-2xl p-3">
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

            {/* 파티 인라인 영역 — 상시 파티(요일 On/Off) + 1회성 등록 + 내 파티 목록 */}
            {shareInlineOpen && (
                <div className="px-4 mt-3">
                    <div className="bg-card border border-green-500/30 rounded-2xl p-4 space-y-4">
                        {/* Migration 505: 템플릿 요일별 On/Off */}
                        <ShareLiveToggleList mdId={user.id} clubs={clubs} />

                    </div>
                </div>
            )}

            {/* 내 오퍼 (받은 오퍼) — 위 파티 등록과 구분 */}
            <div className="px-4 mt-5">
                <p className="text-[13px] font-black text-muted-foreground mb-2 px-1 text-center">내 오퍼</p>
                <Tabs value={activePuzzleTab} className="w-full">
                    <div className="flex items-center gap-2">
                        <TabsList className="flex-1 bg-card border border-border/50 h-11 p-1 rounded-xl">
                            {/* Radix Tabs는 controlled 상태에서 같은 값 재클릭 시 onValueChange를 호출하지 않으므로
                                (useControllableState가 동일값 변경을 무시함), 토글-오프는 onClick으로 직접 처리 */}
                            <TabsTrigger
                                value="flag"
                                onClick={() => setActivePuzzleTab((prev) => (prev === "flag" ? "all" : "flag"))}
                                className="flex-1 rounded-lg font-bold text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground transition-colors hover:text-foreground text-[13px]"
                            >
                                ⛳ 깃발 {flagOffers.length > 0 && <span className="ml-0.5 text-brand-amber">{flagOffers.length}</span>}
                            </TabsTrigger>
                            <TabsTrigger
                                value="share"
                                onClick={() => setActivePuzzleTab((prev) => (prev === "share" ? "all" : "share"))}
                                className="flex-1 rounded-lg font-bold text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground transition-colors hover:text-foreground text-[13px]"
                            >
                                🎉 파티 {shareOffers.length > 0 && <span className="ml-0.5 text-money">{shareOffers.length}</span>}
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
                                            <span className="text-xs font-black text-brand-amber uppercase tracking-wider">
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
                                        <div className="border-b border-border/40 my-1" />
                                    </div>
                                );
                            })()}
                            {visibleOffers.length > 0 ? (
                                visibleOffers.map((offer, i) => {
                                    const p = offer.puzzle;
                                    if (!p) return null;
                                    // 날짜가 바뀌는 첫 카드 위에만 날짜 헤더 (유저 프로필 목록과 동일 스타일)
                                    const prevDate = i === 0 ? null : visibleOffers[i - 1].puzzle?.event_date;
                                    const showDateHeader = i === 0 || prevDate !== p.event_date;
                                    const isAccepted = offer.status === "accepted";
                                    const isShare = !!p.is_recruiting_party;
                                    // 방장이 오픈채팅 링크를 등록해뒀으면 offer_chat 플래그와 무관하게 항상 그쪽으로 보낸다
                                    // (인앱 채팅과 카톡 중 두 곳에서 각자 다른 걸 보고 있는 상황 방지).
                                    const kakaoButton = p.kakao_open_chat_url ? (
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
                                    ) : null;
                                    // 유저가 상담을 시작(leader_chat_started_at)했는데 아직 매치 전인 경우 → 배지/버튼을 채팅 상태 기준으로 세분화
                                    const chatStarted = !isAccepted && !!offer.leader_chat_started_at;
                                    const mdReplied = chatStarted && mdRepliedOfferIdSet.has(offer.id);
                                    return (
                                        <div key={offer.id}>
                                        {showDateHeader && p.event_date && (() => {
                                            const d = new Date(p.event_date + "T00:00:00");
                                            const days = ["일", "월", "화", "수", "목", "금", "토"];
                                            const dday = getDDayLabel(p.event_date);
                                            return (
                                                <div className="flex items-center gap-2.5 px-1 pt-1 pb-0 mb-1.5">
                                                    <div className="w-1 h-[14px] bg-amber-500 rounded-full mt-[1px] flex-shrink-0" />
                                                    <h3 className="text-[16px] font-black text-foreground tracking-tight whitespace-nowrap">
                                                        {`${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`}
                                                    </h3>
                                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full mt-[1px] whitespace-nowrap flex-shrink-0 ${dday === "오늘" ? "bg-amber-500/20 text-brand-amber" : "bg-muted text-muted-foreground"}`}>{dday}</span>
                                                </div>
                                            );
                                        })()}
                                        <Card className={`overflow-hidden bg-card border-border/50 hover:border-border transition-all p-3 gap-2 cursor-pointer active:scale-[0.98] ${
                                            isAccepted ? "border-green-500/30" : ""
                                        }`}>
                                            <Link href={`/flags/${p.id}`} className="block">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 inline-flex items-center rounded-full whitespace-nowrap ${
                                                                isAccepted
                                                                    ? "bg-green-500/20 text-money"
                                                                    : chatStarted
                                                                        ? (mdReplied ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400")
                                                                        : "bg-amber-500/20 text-brand-amber"
                                                            }`}>
                                                                {isAccepted
                                                                    ? "매치됨"
                                                                    : chatStarted
                                                                        ? (mdReplied ? "상담중" : "유저가 답장을 기다리고 있어요")
                                                                        : "오퍼 완료"}
                                                            </span>
                                                        </div>
                                                        {/* 깃발 제목 — 방장이 쓴 헤드라인 (깃발 미리보기 카드와 동일) */}
                                                        <h3 className="font-black text-[18px] text-foreground truncate leading-tight">
                                                            {p.notes || `${p.area}에서 모여요`}
                                                        </h3>
                                                        {/* 깃발 예산 + 인원 배지 — 실제 깃발 카드와 동일한 스타일 */}
                                                        {!isShare && (
                                                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                                                            <span className="text-[16px] font-black text-money">
                                                                예산 {(p.total_budget ?? p.budget_per_person * p.target_count).toLocaleString()}원
                                                            </span>
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 text-money text-[11px] font-bold">
                                                                {formatGenderComposition(p.target_male, p.target_female, p.target_count)}
                                                            </span>
                                                        </div>
                                                        )}
                                                        {/* 오퍼한 클럽 — 항상 노출 (핵심 정보 우선) */}
                                                        <p className="text-[13px] text-muted-foreground truncate">
                                                            {offer.club?.name || "클럽"}
                                                        </p>
                                                    </div>
                                                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                                        {isAccepted ? (
                                                            kakaoButton ? (
                                                                kakaoButton
                                                            ) : (
                                                                <FeatureGate
                                                                    flag="offer_chat"
                                                                    fallback={
                                                                        <a
                                                                            href={p.kakao_open_chat_url}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="h-8 px-3 rounded-lg bg-[#FEE500] text-[#3C1E1E] font-black text-[13px] inline-flex items-center gap-1.5 hover:bg-[#FDD835] transition-colors"
                                                                        >
                                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                                            오픈채팅 연락
                                                                        </a>
                                                                    }
                                                                >
                                                                    <Link
                                                                        href={`/messages/${offer.id}`}
                                                                        className="h-8 px-3 rounded-lg bg-inverse text-inverse-foreground font-black text-[13px] inline-flex items-center gap-1.5 hover:opacity-90 transition-colors"
                                                                    >
                                                                        <MessageCircle className="w-3.5 h-3.5" />
                                                                        채팅
                                                                    </Link>
                                                                </FeatureGate>
                                                            )
                                                        ) : chatStarted ? (
                                                            <Link
                                                                href={`/messages/${offer.id}`}
                                                                className="h-8 px-3 rounded-lg bg-inverse text-inverse-foreground font-black text-[13px] inline-flex items-center gap-1.5 hover:opacity-90 transition-colors"
                                                            >
                                                                <MessageCircle className="w-3.5 h-3.5" />
                                                                채팅
                                                            </Link>
                                                        ) : (
                                                            <div className="relative">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setOpenOfferMenuId((v) => (v === offer.id ? null : offer.id))}
                                                                    className="h-8 px-3 rounded-lg font-black text-[12px] transition-all bg-muted border border-border text-foreground/80 hover:bg-accent"
                                                                >
                                                                    ⋯
                                                                </button>
                                                                {openOfferMenuId === offer.id && (
                                                                    <>
                                                                        <div className="fixed inset-0 z-40" onClick={() => setOpenOfferMenuId(null)} />
                                                                        <div className="absolute right-0 top-9 z-50 w-28 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                                                                            <Link
                                                                                href={`/flags/${p.id}`}
                                                                                onClick={() => setOpenOfferMenuId(null)}
                                                                                className="block w-full px-3 py-2.5 text-left text-[13px] font-bold text-foreground hover:bg-muted transition-colors"
                                                                            >
                                                                                수정
                                                                            </Link>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setOpenOfferMenuId(null);
                                                                                    if (!confirm("이 오퍼를 철회하시겠습니까?")) return;
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
                                                                                className="w-full px-3 py-2.5 text-left text-[13px] font-bold text-red-400 hover:bg-muted transition-colors border-t border-border"
                                                                            >
                                                                                삭제
                                                                            </button>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    </div>
                                            </Link>

                                            {/* 세부사항 드롭다운 — 내 오퍼 금액·구성·코멘트 (파티는 인원·가격 변동이라 숨김) */}
                                            {!isShare && (
                                            <div className="border-t border-border/60">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setOpenOfferDetailsId((v) => (v === offer.id ? null : offer.id));
                                                    }}
                                                    className="flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openOfferDetailsId === offer.id ? "rotate-180" : ""}`} />
                                                    내 오퍼
                                                </button>
                                                {openOfferDetailsId === offer.id && (
                                                <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                                                    <p className="text-[13px] font-black text-brand-amber">
                                                        내 오퍼 금액 {offer.proposed_price.toLocaleString()}원
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="text-[11px] font-bold text-foreground/80 bg-muted px-2 py-0.5 rounded">{offer.table_type}</span>
                                                    {offer.includes?.slice(0, 3).map((item: string) => (
                                                        <span key={item} className="text-[11px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">{item}</span>
                                                    ))}
                                                    {offer.includes?.length > 3 && (
                                                        <span className="text-[11px] text-muted-foreground">+{offer.includes.length - 3}</span>
                                                    )}
                                                    </div>
                                                    {offer.comment && (
                                                        <p className="text-[12px] text-foreground/80 border-l border-border pl-2">&ldquo;{offer.comment}&rdquo;</p>
                                                    )}
                                                </div>
                                                )}
                                            </div>
                                            )}
                                        </Card>
                                        </div>
                                    );
                                })
                            ) : activePuzzleTab === "all" ? null : tabOffers.length === 0 ? (
                                <div className="py-16 text-center space-y-4 bg-card/30 rounded-3xl border border-dashed border-border/50">
                                    <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto text-3xl">
                                        📨
                                    </div>
                                    <p className="text-muted-foreground font-medium text-sm">
                                        {activePuzzleTab === "share" ? "보낸 파티 오퍼가 없습니다" : "보낸 깃발 오퍼가 없습니다"}
                                    </p>
                                    <p className="text-muted-foreground text-xs px-10 leading-relaxed">
                                        {activePuzzleTab === "share"
                                            ? <>홈 파티 탭에서 유저들이 올린 파티를 확인하고<br/>오퍼를 보내보세요</>
                                            : <>홈에서 유저들이 꽂은 깃발을 확인하고<br/>오퍼를 보내보세요</>}
                                    </p>
                                    <Link href={activePuzzleTab === "share" ? "/?tab=share" : "/?tab=puzzle"}>
                                        <Button className="rounded-full bg-inverse text-inverse-foreground font-black hover:opacity-90 h-10 px-6 mt-2">
                                            <span className="mr-1">{activePuzzleTab === "share" ? "🎉" : "⛳"}</span>
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
            <div className="px-6 py-6 space-y-4 text-foreground">
                {/* 크레딧 — 보유/충전 동선만 노출 (성과 통계는 제거) */}
                <Link
                    href="/md/credits"
                    className="flex items-center justify-between rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3.5 group hover:bg-amber-500/[0.12] transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/15">
                            <Coins className="w-4 h-4 text-brand-amber" />
                        </div>
                        <div className="space-y-0.5">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">보유 크레딧</span>
                            <p className={`text-[22px] font-black leading-none ${mdCredits !== null && mdCredits < 30 ? "text-red-400" : "text-brand-amber"}`}>
                                {mdCredits ?? "—"}<span className="text-[12px] text-muted-foreground ml-0.5">크레딧</span>
                            </p>
                        </div>
                    </div>
                    <span className="flex items-center gap-1 rounded-full bg-white px-4 py-2 text-[13px] font-black text-black group-hover:bg-white/90 transition-colors">
                        <Plus className="w-4 h-4" />충전
                    </span>
                </Link>
                <CreditHistory userId={user.id} />
            </div>

            {/* Club Selector Sheet (복수 클럽용) */}
            <Sheet open={clubSheetOpen} onOpenChange={setClubSheetOpen}>
                <SheetContent side="bottom" className="bg-background border-border rounded-t-3xl max-h-[60vh]">
                    <SheetHeader className="pb-4">
                        <SheetTitle className="text-foreground font-black text-lg">내 클럽 목록</SheetTitle>
                    </SheetHeader>
                    <div className="space-y-2 overflow-y-auto pb-6">
                        {clubs.map((club) => {
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
                                            : "bg-card border border-border hover:border-border"
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-[15px] font-bold text-foreground truncate">{club.name}</h4>
                                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                            <MapPin className="w-3 h-3" />
                                            {club.area}
                                        </p>
                                    </div>
                                    {isDefault && (
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className="text-[11px] text-brand-amber font-medium">기본 클럽</span>
                                            <CheckCircle className="w-5 h-5 text-brand-amber" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                        <Link
                            href="/md/clubs"
                            onClick={() => setClubSheetOpen(false)}
                            className="flex items-center justify-center gap-1.5 py-3 text-[13px] font-bold text-muted-foreground hover:text-foreground/80 transition-colors"
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
                    className="bg-background border-border rounded-t-3xl !h-[92vh] !max-h-[92vh] !gap-0 !p-0 !flex !flex-col"
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
                    className="bg-background border-border rounded-t-3xl !h-[92vh] !max-h-[92vh] !gap-0 !p-0 !flex !flex-col"
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
                        ? <CheckSquare className="w-5 h-5 text-foreground" />
                        : <Square className="w-5 h-5 text-muted-foreground" />
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
                <div className="flex-1 h-px bg-muted" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">종료 {auctions.length}건</span>
                <div className="flex-1 h-px bg-muted" />
            </div>

            {/* 필터 칩 + 선택 모드 토글 */}
            <div className="flex items-center gap-2">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
                    {([
                        { key: "all" as const, label: "전체", count: auctions.length, color: "" },
                        { key: "done" as const, label: "✅ 판매완료", count: doneCount, color: "text-money" },
                        { key: "none" as const, label: "유찰", count: noneCount, color: "text-muted-foreground" },
                    ]).map(chip => (
                        <button
                            key={chip.key}
                            onClick={() => setStatusFilter(chip.key)}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors border ${
                                statusFilter === chip.key
                                    ? "bg-inverse text-inverse-foreground border-white"
                                    : "bg-card text-muted-foreground border-border hover:border-border"
                            }`}
                        >
                            <span className={statusFilter === chip.key ? "" : chip.color}>{chip.label}</span>
                            {chip.count > 0 && (
                                <span className={`ml-1 ${statusFilter === chip.key ? "text-muted-foreground" : "text-muted-foreground"}`}>
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
                            : "bg-card border-border text-muted-foreground hover:border-border"
                    }`}
                >
                    {selectMode ? "취소" : "선택"}
                </button>
            </div>

            {/* 선택 모드 액션 바 */}
            {selectMode && (
                <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-2.5">
                    <button
                        onClick={() => toggleSelectAll(filtered.map(a => a.id))}
                        className="flex items-center gap-2 text-[13px] font-bold text-foreground/80"
                    >
                        {filtered.every(a => selectedIds.has(a.id))
                            ? <CheckSquare className="w-4 h-4 text-foreground" />
                            : <Square className="w-4 h-4 text-muted-foreground" />
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
                                className="w-full py-3 flex items-center justify-center gap-1.5 text-[13px] font-bold text-muted-foreground hover:text-foreground/80 bg-card/50 rounded-xl border border-border/50 transition-colors"
                            >
                                이전 경매 {olderCount}건 더보기
                                <ChevronDown className="w-4 h-4" />
                            </button>
                        )
                    )}
                </>
            ) : (
                <div className="py-8 text-center">
                    <p className="text-muted-foreground text-sm">
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
        <div className="py-16 text-center space-y-4 bg-card/30 rounded-3xl border border-dashed border-border/50">
            <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto">
                <TrendingUp className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium text-sm">{label}</p>
            <p className="text-muted-foreground text-xs px-10 leading-relaxed">
                {description || (
                    <>번거로운 홍보 없이 등록만으로 수많은 유저들에게<br/>파트너님의 상품을 알려보세요</>
                )}
            </p>
            <Link href="/md/auctions/new">
                <Button className="rounded-full bg-inverse text-inverse-foreground font-black hover:opacity-90 h-10 px-6 mt-2">
                    <Plus className="w-4 h-4 mr-1" />
                    파티 등록하기
                </Button>
            </Link>
        </div>
    );
}
