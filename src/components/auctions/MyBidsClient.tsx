"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { closeExpiredAuctions } from "@/lib/utils/closeExpiredAuction";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MyBidCard, type BidWithAuction } from "./MyBidCard";
import { ChatInterestCard, type ChatInterestWithAuction } from "./ChatInterestCard";
import { MyBidCardContact } from "./MyBidCardContact";
import { FallbackOfferCard } from "./FallbackOfferCard";
import { ReportMDButton } from "./ReportMDButton";
import { useMyBidsRealtime, type AuctionUpdate } from "@/hooks/useMyBidsRealtime";
import { isAuctionActive, isAuctionExpired } from "@/lib/utils/auction";
import { normalizeProfileImage } from "@/lib/utils/image";
import { formatPrice, formatEventDate, formatEntryTime } from "@/lib/utils/format";
import type { Auction, Puzzle, PublicUserProfile } from "@/types/database";
import { MDContactCard } from "@/components/puzzles/MDContactCard";
import { CopyAcceptedMessageButton } from "@/components/puzzles/CopyAcceptedMessageButton";
import {
  Gavel,
  Clock,
  Trophy,
  MapPin,
  Calendar,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Star,
  Phone,
  PartyPopper,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

export interface WonAuctionData {
  id: string;
  status: string;
  won_at: string;
  updated_at: string;
  contact_deadline: string | null;
  contact_attempted_at?: string | null;
  winning_price: number | null;
  current_bid: number;
  event_date: string;
  entry_time: string | null;
  table_info: string | null;
  winner_id: string | null;
  listing_type?: "auction" | "instant";
  // opt-in fallback 필드 (Migration 088)
  fallback_offered_to?: string | null;
  fallback_deadline?: string | null;
  club: { name: string; area: string } | null;
  md: {
    name: string | null;
    phone: string | null;
    instagram: string | null;
    kakao_open_chat_url: string | null;
    preferred_contact_methods: ("dm" | "kakao" | "phone")[] | null;
  } | null;
  [key: string]: unknown;
}

export type { ChatInterestWithAuction };

/**
 * 내 활동 카드용 enriched puzzle.
 * accepted 상태일 때 수락된 오퍼의 MD 프로필 + 클럽 + 가격 정보를 포함.
 */
export type PuzzleWithAcceptedOffer = Puzzle & {
  accepted_offer?: {
    id: string;
    table_type: string;
    proposed_price: number;
    includes: string[];
    comment: string | null;
    club: { id: string; name: string; area: string } | null;
    md: Pick<PublicUserProfile,
      "id" | "display_name" | "profile_image" | "md_deal_count" |
      "instagram" | "phone" | "kakao_open_chat_url" | "preferred_contact_methods"
    > | null;
  } | null;
};

interface MyBidsClientProps {
  initialBids: BidWithAuction[];
  initialWonAuctions?: WonAuctionData[];
  initialChatInterests?: ChatInterestWithAuction[];
  reportedAuctionIds?: string[];
  userId: string;
  initialTab?: string;
  initialPuzzles?: PuzzleWithAcceptedOffer[];
}

const DISMISSED_KEY = "nightflow_dismissed_bids";

function loadDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissedIds(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

function getWonStatusConfig(status: string, isInstant = false) {
  switch (status) {
    case "won":
      return {
        label: isInstant ? "예약 가능! 파트너에게 연락하세요" : "매칭 성공! 파트너에게 연락하세요",
        className:
          "bg-amber-500/10 text-brand-amber border-amber-500/20 animate-pulse",
        icon: Phone,
      };
    case "confirmed":
      return {
        label: "방문 확인 완료",
        className: "bg-green-500/10 text-money border-green-500/20",
        icon: CheckCircle2,
      };
    case "expired":
      return {
        label: "연락 시간 만료",
        className: "bg-red-500/10 text-red-500 border-red-500/20",
        icon: XCircle,
      };
    case "cancelled":
      return {
        label: "취소됨",
        className: "bg-muted/10 text-muted-foreground border-border/20",
        icon: XCircle,
      };
    default:
      return {
        label: isInstant ? "예약완료" : "낙찰",
        className: "bg-amber-500/10 text-brand-amber border-amber-500/20",
        icon: PartyPopper,
      };
  }
}

export function MyBidsClient({
  initialBids,
  initialWonAuctions = [],
  initialChatInterests = [],
  reportedAuctionIds = [],
  userId,
  initialTab,
  initialPuzzles = [],
}: MyBidsClientProps) {
  const [bids, setBids] = useState<BidWithAuction[]>(initialBids);
  const [wonAuctions, setWonAuctions] =
    useState<WonAuctionData[]>(initialWonAuctions);
  const [chatInterests, setChatInterests] =
    useState<ChatInterestWithAuction[]>(initialChatInterests);
  const [dismissedIds, setDismissedIds] =
    useState<Set<string>>(loadDismissedIds);
  const reportedSet = useMemo(
    () => new Set(reportedAuctionIds),
    [reportedAuctionIds]
  );

  const [puzzles] = useState<PuzzleWithAcceptedOffer[]>(initialPuzzles);

  const hasInitialUrgentWon = initialWonAuctions.some(a => a.status === "won" && !a.fallback_offered_to);
  const defaultTab =
    initialTab === "puzzle" ? "puzzle" :
    initialTab === "ended" ? "ended" :
    initialTab === "active" ? "active" :
    hasInitialUrgentWon ? "ended" :
    "puzzle";

  const fetchBids = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("bids")
      .select(
        `
        *,
        auction:auctions (
          *,
          club:clubs (*)
        )
      `
      )
      .eq("bidder_id", user.id)
      .order("bid_at", { ascending: false });

    if (error) {
      console.error("Error refetching bids:", error);
      return;
    }

    if (data) {
      const latestBids = Array.from(
        data
          .reduce((map, bid) => {
            if (!map.has(bid.auction_id)) {
              map.set(bid.auction_id, bid);
            }
            return map;
          }, new Map())
          .values()
      ) as BidWithAuction[];

      setBids(latestBids);
    }
  }, []);

  const fetchWonAuctions = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: wonBids } = await supabase
      .from("bids")
      .select(
        `*, auction:auctions (*, club:clubs(*), md:md_id(name, phone, instagram, kakao_open_chat_url, preferred_contact_methods))`
      )
      .eq("bidder_id", user.id)
      .eq("status", "won")
      .order("bid_at", { ascending: false });

    const { data: winnerAuctions } = await supabase
      .from("auctions")
      .select(
        `*, club:club_id(*), md:md_id(name, phone, instagram, kakao_open_chat_url, preferred_contact_methods)`
      )
      .eq("winner_id", user.id)
      .order("won_at", { ascending: false });

    // fallback 제안 받은 경매 (winner_id가 없지만 fallback_offered_to가 내 ID)
    const { data: fallbackAuctions } = await supabase
      .from("auctions")
      .select(
        `*, club:club_id(*), md:md_id(name, phone, instagram, kakao_open_chat_url, preferred_contact_methods)`
      )
      .eq("fallback_offered_to", user.id)
      .not("fallback_deadline", "is", null)
      .order("fallback_offered_at", { ascending: false });

    const auctionMap = new Map<string, WonAuctionData>();

    if (wonBids) {
      for (const bid of wonBids) {
        if (bid.auction && !auctionMap.has(bid.auction_id)) {
          auctionMap.set(bid.auction_id, bid.auction as WonAuctionData);
        }
      }
    }

    if (winnerAuctions) {
      for (const auction of winnerAuctions) {
        if (!auctionMap.has(auction.id)) {
          auctionMap.set(auction.id, auction as WonAuctionData);
        }
      }
    }

    // fallback 제안 받은 경매 병합
    if (fallbackAuctions) {
      for (const auction of fallbackAuctions) {
        if (!auctionMap.has(auction.id)) {
          auctionMap.set(auction.id, auction as WonAuctionData);
        }
      }
    }

    const sorted = Array.from(auctionMap.values()).sort(
      (a, b) =>
        new Date(b.won_at || b.updated_at).getTime() -
        new Date(a.won_at || a.updated_at).getTime()
    );

    setWonAuctions(sorted);
  }, []);

  const fetchChatInterests = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("chat_interests")
      .select(`*, auction:auctions (*, club:clubs (*))`)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) setChatInterests(data as ChatInterestWithAuction[]);
  }, []);

  useEffect(() => {
    fetchBids();
    fetchWonAuctions();
    fetchChatInterests();

    const handleFocus = () => {
      fetchBids();
      fetchWonAuctions();
      fetchChatInterests();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchBids, fetchWonAuctions, fetchChatInterests]);

  // active 경매 ID 추출 (만료됐지만 아직 close 안된 경매도 포함 → 상태 변경 폴링)
  const activeAuctionIds = useMemo(
    () =>
      bids
        .filter(
          (b) =>
            b.auction.status === "active" &&
            (isAuctionActive(b.auction) || isAuctionExpired(b.auction))
        )
        .map((b) => b.auction_id),
    [bids]
  );

  // 실시간 폴링
  useMyBidsRealtime(activeAuctionIds, (updates: AuctionUpdate[]) => {
    setBids((prev) =>
      prev.map((bid) => {
        const update = updates.find((u) => u.id === bid.auction_id);
        if (update) {
          const merged: Auction = {
            ...bid.auction,
            current_bid: update.current_bid,
            bid_count: update.bid_count,
            bidder_count: update.bidder_count,
            status: update.status,
            winner_id: update.winner_id,
            extended_end_at: update.extended_end_at,
            auction_end_at: update.auction_end_at,
          };
          return { ...bid, auction: { ...merged, club: bid.auction.club } };
        }
        return bid;
      })
    );

    // 낙찰 감지 시 wonAuctions 리프레시
    const hasNewWin = updates.some(
      (u) => u.status === "won" && u.winner_id === userId
    );
    if (hasNewWin) {
      fetchWonAuctions();
    }
  });

  // Gap 9.2: 만료 경매 즉시 close_auction() 호출 (cron 대기 없이)
  // 모듈 전역 Set으로 탭 세션 전체 dedupe (closeExpiredAuctions 내부 처리)
  useEffect(() => {
    const expired = bids
      .filter((b) => b.auction.status === "active" && isAuctionExpired(b.auction))
      .map((b) => b.auction_id);

    if (expired.length === 0) return;

    const supabase = createClient();
    closeExpiredAuctions(expired, supabase).then(() => {
      // 성공/실패 모두 refetch (cron이 먼저 처리했어도 최신 데이터 필요)
      fetchBids();
      fetchWonAuctions();
    });
  }, [bids, fetchBids, fetchWonAuctions]);

  // 탭별 분류
  const { activeBids, endedBids } = useMemo(() => {
    const active: BidWithAuction[] = [];
    const ended: BidWithAuction[] = [];

    for (const bid of bids) {
      const auctionIsActive =
        bid.auction.status === "active" && isAuctionActive(bid.auction);
      if (auctionIsActive) {
        active.push(bid);
      } else {
        ended.push(bid);
      }
    }
    return { activeBids: active, endedBids: ended };
  }, [bids]);

  // effectiveStatus: contact_deadline 만료 시 클라이언트에서 즉시 expired 처리
  const getEffectiveStatus = useCallback((a: WonAuctionData) => {
    if (
      a.status === "won" &&
      a.contact_deadline &&
      new Date(a.contact_deadline).getTime() <= Date.now()
    ) {
      return "expired";
    }
    return a.status;
  }, []);

  // fallback 제안 받은 경매 (수락 대기 중, 아직 만료 안 됨)
  const fallbackOfferAuctions = useMemo(
    () =>
      wonAuctions.filter(
        (a) =>
          a.fallback_offered_to &&
          a.fallback_deadline &&
          new Date(a.fallback_deadline).getTime() > Date.now()
      ),
    [wonAuctions]
  );

  // 낙찰 탭: 긴급 액션 필요한 낙찰 (won) — 만료된 것 제외, fallback 제안 중인 것 제외
  const activeWonAuctions = useMemo(
    () =>
      wonAuctions.filter(
        (a) =>
          getEffectiveStatus(a) === "won" &&
          !a.fallback_offered_to
      ),
    [wonAuctions, getEffectiveStatus]
  );

  // 종료 탭에서 낙찰 완료/만료된 것도 포함
  const completedWonAuctions = useMemo(
    () =>
      wonAuctions.filter((a) =>
        ["confirmed", "expired", "cancelled"].includes(getEffectiveStatus(a))
      ),
    [wonAuctions, getEffectiveStatus]
  );

  // 낙찰 경매 ID (종료탭 중복 표시 방지)
  const wonAuctionIds = useMemo(
    () => new Set(wonAuctions.map((a) => a.id)),
    [wonAuctions]
  );

  // 대화중 탭: chat_interests 분류
  const { activeInterests, endedInterests } = useMemo(() => {
    const active: ChatInterestWithAuction[] = [];
    const ended: ChatInterestWithAuction[] = [];

    for (const interest of chatInterests) {
      if (wonAuctionIds.has(interest.auction_id)) continue;
      if (dismissedIds.has(interest.auction_id)) continue;
      const auctionIsActive = interest.auction.status === "active" && isAuctionActive(interest.auction);
      if (auctionIsActive) {
        active.push(interest);
      } else {
        ended.push(interest);
      }
    }
    return { activeInterests: active, endedInterests: ended };
  }, [chatInterests, wonAuctionIds, dismissedIds]);

  // 삭제된 항목 + 낙찰 경매 필터링 (낙찰/종료탭에 이미 표시되므로 제외)
  const visibleEndedBids = useMemo(
    () => endedBids.filter(
      (b) => !dismissedIds.has(b.auction_id) && !wonAuctionIds.has(b.auction_id)
    ),
    [endedBids, dismissedIds, wonAuctionIds]
  );

  const handleDismiss = useCallback((auctionId: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(auctionId);
      saveDismissedIds(next);
      return next;
    });

    toast("입찰 내역을 삭제했습니다", {
      action: {
        label: "되돌리기",
        onClick: () => {
          setDismissedIds((prev) => {
            const next = new Set(prev);
            next.delete(auctionId);
            saveDismissedIds(next);
            return next;
          });
        },
      },
      duration: 4000,
    });
  }, []);

  // 낙찰 탭에 긴급 카드가 있으면 배지 펄스 (fallback 제안 포함)
  const hasUrgentWon = activeWonAuctions.some((a) => a.status === "won") || fallbackOfferAuctions.length > 0;

  return (
    <div className="min-h-screen bg-background pt-16 pb-32">
      <div className="max-w-lg mx-auto px-4">
        <header className="py-8 space-y-2">
          <h1 className="text-3xl font-black text-foreground tracking-tighter">
            내 활동
          </h1>
          <p className="text-muted-foreground font-medium">
            입찰, 예약, 종료된 내역을 한곳에서 확인하세요.
          </p>
        </header>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="w-full bg-card rounded-xl p-1 border border-border grid grid-cols-3">
            <TabsTrigger
              value="puzzle"
              className="rounded-lg text-[12px] font-bold data-[state=active]:bg-amber-500 data-[state=active]:text-white text-muted-foreground"
            >
              ⛳ 깃발{puzzles.length > 0 && ` (${puzzles.length})`}
            </TabsTrigger>
            <TabsTrigger
              value="active"
              className="rounded-lg text-[12px] font-bold data-[state=active]:bg-inverse data-[state=active]:text-inverse-foreground text-muted-foreground"
            >
              📅 얼리버드
            </TabsTrigger>
            <TabsTrigger
              value="ended"
              className="rounded-lg text-[12px] font-bold data-[state=active]:bg-inverse data-[state=active]:text-inverse-foreground text-muted-foreground relative"
            >
              <span className={hasUrgentWon ? "text-brand-amber data-[state=active]:text-black" : ""}>
                🏆 낙찰/종료
              </span>
              {hasUrgentWon && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* 입찰중 탭 */}
          <TabsContent value="active" className="mt-4">
            <div className="space-y-4">
              {activeBids.length > 0 ? (
                activeBids.map((bid) => (
                  <MyBidCard
                    key={bid.id}
                    bid={bid}
                    userId={userId}
                    isEnded={false}
                  />
                ))
              ) : (
                <EmptyActive />
              )}
            </div>
          </TabsContent>

          {/* 낙찰/종료 탭 */}
          <TabsContent value="ended" className="mt-4">
            <div className="space-y-4">
              {/* 최우선: 차순위 낙찰 제안 (수락/거절 필요) */}
              {fallbackOfferAuctions.map((auction) => (
                <FallbackOfferCard
                  key={`fallback-${auction.id}`}
                  auction={{
                    id: auction.id,
                    fallback_deadline: auction.fallback_deadline!,
                    winning_price: auction.winning_price,
                    current_bid: auction.current_bid,
                    event_date: auction.event_date,
                    entry_time: auction.entry_time,
                    table_info: auction.table_info,
                    club: auction.club,
                  }}
                  onAccepted={fetchWonAuctions}
                  onDeclined={fetchWonAuctions}
                />
              ))}
              {/* 긴급: 액션 필요한 낙찰 (won) */}
              {activeWonAuctions.map((auction) => (
                <WonAuctionCard
                  key={`urgent-${auction.id}`}
                  auction={auction}
                  reportedSet={reportedSet}
                />
              ))}
              {/* 완료된 낙찰 (confirmed, expired, cancelled) */}
              {completedWonAuctions.map((auction) => (
                <WonAuctionCard
                  key={`won-${auction.id}`}
                  auction={auction}
                  reportedSet={reportedSet}
                />
              ))}
              {/* 종료된 대화 (오늘특가) */}
              {endedInterests.map((interest) => (
                <ChatInterestCard
                  key={`interest-${interest.id}`}
                  interest={interest}
                  isEnded={true}
                  onDismiss={handleDismiss}
                />
              ))}
              {/* 일반 종료 입찰 */}
              {visibleEndedBids.map((bid) => (
                <MyBidCard
                  key={bid.id}
                  bid={bid}
                  userId={userId}
                  isEnded={true}
                  onDismiss={handleDismiss}
                />
              ))}
              {activeWonAuctions.length === 0 &&
                completedWonAuctions.length === 0 &&
                endedInterests.length === 0 &&
                visibleEndedBids.length === 0 && <EmptyEnded />}
            </div>
          </TabsContent>
          {/* 퍼즐 탭 */}
          <TabsContent value="puzzle" className="mt-4">
            <div className="space-y-3">
              {puzzles.length === 0 ? (
                <EmptyPuzzle />
              ) : (
                puzzles.map((puzzle) => (
                  <MyPuzzleCard key={puzzle.id} puzzle={puzzle} userId={userId} />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// 낙찰 카드 (my-wins 페이지의 카드 UI 이관)
function WonAuctionCard({
  auction,
  reportedSet,
}: {
  auction: WonAuctionData;
  reportedSet: Set<string>;
}) {
  const isContactExpired =
    auction.status === "won" &&
    !!auction.contact_deadline &&
    new Date(auction.contact_deadline).getTime() <= Date.now();

  const isInstant = auction.listing_type === "instant";
  const effectiveStatus = isContactExpired ? "expired" : auction.status;
  const config = getWonStatusConfig(effectiveStatus, isInstant);
  const StatusIcon = config.icon;
  const isWonWaiting = effectiveStatus === "won";
  const isTerminal = ["expired", "cancelled", "unsold"].includes(
    effectiveStatus
  );

  return (
    <Card className={`bg-card overflow-hidden ${isTerminal ? "border-border" : "won-card-accent won-card-glow border-border"}`}>
      <div className="p-5 space-y-4">
        {/* Status & ID */}
        <div className="flex justify-between items-center">
          <Badge
            className={`${config.className} font-black text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5`}
          >
            <StatusIcon className="w-3.5 h-3.5" />
            {config.label}
          </Badge>
          <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider ml-auto">
            {auction.id.slice(0, 8).toUpperCase()}
          </span>
        </div>

        {/* Club Info */}
        <div className="space-y-1.5">
          <h2 className={`text-xl font-black tracking-tight ${isTerminal ? "text-foreground" : "text-brand-amber"}`}>
            {auction.club?.name}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold">
            <MapPin className="w-3 h-3" /> {auction.club?.area}
            <span>·</span>
            <Calendar className="w-3 h-3" />{" "}
            {formatEventDate(auction.event_date)}
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-blue-400" />
            <span className="text-xs font-bold text-blue-400">
              {formatEntryTime(auction.entry_time, auction.event_date)}
            </span>
          </div>
        </div>

        {/* Price Info */}
        <div className="bg-card/50 rounded-2xl p-4 border border-border/50">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-sm font-bold">안내가</span>
            <span className="text-2xl font-black text-foreground">
              {formatPrice(auction.winning_price || auction.current_bid)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground font-medium text-right mt-1">
            * 결제 방식은 파트너 안내에 따라 진행
          </p>
        </div>

        {/* Won: Contact CTA */}
        {isWonWaiting && <MyBidCardContact auction={auction} />}

        {/* Expired: Warning */}
        {(auction.status === "expired" || isContactExpired) && (
          <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-red-500/80 font-bold leading-tight">
              연락 시간이 만료되어 매칭이 취소되었습니다.
            </p>
          </div>
        )}

        {/* Confirmed: Review CTA */}
        {auction.status === "confirmed" && (
          <Link href={`/my-wins/${auction.id}/review`}>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Star className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-yellow-400 font-bold text-sm">
                    경험은 어떠셨나요?
                  </p>
                  <p className="text-muted-foreground text-xs">리뷰를 남겨주세요</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-yellow-400" />
            </div>
          </Link>
        )}

        {/* Actions */}
        <Link href={`/auctions/${auction.id}`}>
          <Button
            className={`w-full h-12 font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-all ${
              isTerminal
                ? "bg-muted text-muted-foreground hover:bg-muted"
                : "bg-inverse text-inverse-foreground hover:opacity-90"
            }`}
          >
            상세 내역 보기
            <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>

        {/* 낙찰 포기 / MD 미응답 신고 */}
        {isWonWaiting && (
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <Link
              href={`/my-wins/${auction.id}/cancel`}
              className="flex items-center gap-1.5 py-2 px-1 group"
            >
              <XCircle className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground/80 transition-colors" />
              <span className="text-xs text-muted-foreground font-medium group-hover:text-foreground/80 transition-colors">
                예약 취소
              </span>
            </Link>
            <ReportMDButton
              auctionId={auction.id}
              wonAt={auction.won_at}
              contactDeadline={auction.contact_deadline}
              initialHasReported={reportedSet.has(auction.id)}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function MyPuzzleCard({ puzzle, userId }: { puzzle: PuzzleWithAcceptedOffer; userId: string }) {
  const isLeader = puzzle.leader_id === userId;
  const isOpen = puzzle.status === "open";
  const isAccepted = puzzle.status === "accepted";
  const confirmedBudget = puzzle.current_count * puzzle.budget_per_person;
  const acceptedOffer = puzzle.accepted_offer ?? null;
  const acceptedMd = acceptedOffer?.md ?? null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${m}/${day} ${days[d.getDay()]}`;
  };

  const statusLabel: Record<string, string> = {
    open: "🟢 제안 받는중",
    matched: "✅ 성사 (인원마감)",
    accepted: "성사됨",
    cancelled: "↩️ 취소됨",
    expired: "❌ 매칭 실패",
  };

  const statusColorClass: Record<string, string> = {
    open: "text-money",
    matched: "text-brand-amber",
    accepted: "text-brand-amber",
    cancelled: "text-muted-foreground",
    expired: "text-red-400",
  };

  const isTerminal = ["expired", "cancelled", "matched"].includes(puzzle.status);

  // 성사된 leader puzzle은 amber 카드로 강조 + MD 연락처 인라인 노출
  if (isAccepted && isLeader && acceptedMd) {
    return (
      <Card className="bg-amber-500/10 border-amber-500/30 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand-amber" />
            <span className="text-[14px] font-black text-brand-amber">성사됨</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[11px] text-muted-foreground">
              {formatDate(puzzle.event_date)} · {puzzle.area}
            </span>
            <span className="text-[10px] text-muted-foreground">
              등록 {new Date(puzzle.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
          </div>
        </div>

        {acceptedOffer && (
          <div className="space-y-1.5 pb-2 border-b border-amber-500/20">
            <p className="text-[14px] font-bold text-foreground">
              {acceptedOffer.club?.name || "클럽"}
            </p>
            <p className="text-[13px] text-foreground/80">
              💰 {acceptedOffer.proposed_price.toLocaleString()}원
            </p>
            {acceptedOffer.includes.length > 0 && (
              <div className="flex flex-wrap gap-1 w-full">
                {acceptedOffer.includes.map((inc) => (
                  <span key={inc} className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/20 text-money break-words max-w-full">
                    {inc}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <div className="relative w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center overflow-hidden">
            <span className="absolute inset-0 flex items-center justify-center font-black text-muted-foreground text-[13px]">
              {(acceptedMd.display_name || "M").substring(0, 1)}
            </span>
            {acceptedMd.profile_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={normalizeProfileImage(acceptedMd.profile_image)!}
                alt={acceptedMd.display_name || "파트너"}
                className="relative w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            )}
          </div>
          <div>
            <p className="text-foreground font-bold text-[13px]">{acceptedMd.display_name || "파트너"}</p>
            <p className="text-[10px] text-muted-foreground">NightFlow 인증 파트너</p>
          </div>
        </div>

        <CopyAcceptedMessageButton puzzle={puzzle} offer={acceptedOffer} />

        <MDContactCard md={acceptedMd} />

        <Link
          href={`/flags/${puzzle.id}`}
          className="flex items-center justify-end text-[11px] text-muted-foreground hover:text-foreground/80 transition-colors pt-1"
        >
          상세 / 관리 →
        </Link>
      </Card>
    );
  }

  return (
    <Link href={`/flags/${puzzle.id}`}>
      <Card className={`bg-card border-border p-4 space-y-2 ${isTerminal ? "opacity-70" : ""}`}>
        <div className="flex items-start justify-between">
          <span className="text-[14px] font-black text-foreground">
            {formatDate(puzzle.event_date)} · {puzzle.area}
          </span>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-brand-amber">
              {isLeader ? "대표자" : "참여중"}
            </span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {new Date(puzzle.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">
            {puzzle.current_count}/{puzzle.target_count}명 · 확정 {confirmedBudget.toLocaleString()}원
          </span>
          <span
            className={`font-black ${isTerminal ? "text-[13px]" : ""} ${
              statusColorClass[puzzle.status] || "text-muted-foreground"
            }`}
          >
            {statusLabel[puzzle.status] || puzzle.status}
          </span>
        </div>
        <div className="flex justify-end">
          <span className="text-[12px] text-muted-foreground">
            {isTerminal ? "[결과 보기]" : isLeader ? "[관리]" : "[보기]"} →
          </span>
        </div>
      </Card>
    </Link>
  );
}

function EmptyChat() {
  return (
    <div className="py-24 text-center space-y-4">
      <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto">
        <MessageCircle className="w-8 h-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground font-medium">
        대화중인 내역이 없습니다.
      </p>
      <Link href="/">
        <Button
          variant="link"
          className="text-muted-foreground font-bold underline"
        >
          오늘특가 보러가기
        </Button>
      </Link>
    </div>
  );
}

function EmptyActive() {
  return (
    <div className="py-24 text-center space-y-4">
      <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto">
        <Gavel className="w-8 h-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground font-medium">
        입찰중인 내역이 없습니다.
      </p>
      <Link href="/">
        <Button
          variant="link"
          className="text-muted-foreground font-bold underline"
        >
          지금 진행 중인 테이블 보러가기
        </Button>
      </Link>
    </div>
  );
}

function EmptyEnded() {
  return (
    <div className="py-24 text-center space-y-4">
      <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto">
        <Clock className="w-8 h-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground font-medium">
        낙찰/종료된 내역이 없습니다.
      </p>
    </div>
  );
}

function EmptyPuzzle() {
  return (
    <div className="py-24 text-center space-y-4">
      <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto">
        <span className="text-3xl">🎉</span>
      </div>
      <p className="text-muted-foreground font-medium">
        참여 중인 깃발이 없습니다.
      </p>
      <Link href="/?tab=puzzle">
        <Button variant="link" className="text-muted-foreground font-bold underline">
          깃발 둘러보기
        </Button>
      </Link>
    </div>
  );
}
