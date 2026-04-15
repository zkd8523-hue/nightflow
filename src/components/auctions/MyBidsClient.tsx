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
import { formatPrice, formatEventDate, formatEntryTime } from "@/lib/utils/format";
import type { Auction, Puzzle } from "@/types/database";
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

interface MyBidsClientProps {
  initialBids: BidWithAuction[];
  initialWonAuctions?: WonAuctionData[];
  initialChatInterests?: ChatInterestWithAuction[];
  reportedAuctionIds?: string[];
  userId: string;
  initialTab?: string;
  initialPuzzles?: Puzzle[];
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
        label: isInstant ? "예약 가능! MD에게 연락하세요" : "매칭 성공! MD에게 연락하세요",
        className:
          "bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse",
        icon: Phone,
      };
    case "confirmed":
      return {
        label: "방문 확인 완료",
        className: "bg-green-500/10 text-green-500 border-green-500/20",
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
        className: "bg-neutral-500/10 text-neutral-500 border-neutral-500/20",
        icon: XCircle,
      };
    default:
      return {
        label: isInstant ? "구매완료" : "낙찰",
        className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
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

  const [puzzles] = useState<Puzzle[]>(initialPuzzles);

  const hasInitialUrgentWon = initialWonAuctions.some(a => a.status === "won" && !a.fallback_offered_to);
  const defaultTab = initialTab === "puzzle" ? "puzzle" : initialTab === "chat" ? "chat" : initialTab === "ended" ? "ended" : hasInitialUrgentWon ? "ended" : "active";

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
    <div className="min-h-screen bg-[#0A0A0A] pt-16 pb-32">
      <div className="max-w-lg mx-auto px-4">
        <header className="py-8 space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tighter">
            내 활동
          </h1>
          <p className="text-neutral-500 font-medium">
            입찰, 예약, 구매, 종료된 내역을 한곳에서 확인하세요.
          </p>
        </header>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="w-full bg-[#1C1C1E] rounded-xl p-1 border border-neutral-800 grid grid-cols-4">
            <TabsTrigger
              value="chat"
              className="rounded-lg text-[12px] font-bold data-[state=active]:bg-white data-[state=active]:text-black text-neutral-500"
            >
              오늘특가
            </TabsTrigger>
            <TabsTrigger
              value="active"
              className="rounded-lg text-[12px] font-bold data-[state=active]:bg-white data-[state=active]:text-black text-neutral-500"
            >
              얼리버드
            </TabsTrigger>
            <TabsTrigger
              value="ended"
              className="rounded-lg text-[12px] font-bold data-[state=active]:bg-white data-[state=active]:text-black text-neutral-500 relative"
            >
              <span className={hasUrgentWon ? "text-amber-500 data-[state=active]:text-black" : ""}>
                낙찰/종료
              </span>
              {hasUrgentWon && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="puzzle"
              className="rounded-lg text-[12px] font-bold data-[state=active]:bg-purple-500 data-[state=active]:text-white text-neutral-500"
            >
              🧩 퍼즐{puzzles.length > 0 && ` (${puzzles.length})`}
            </TabsTrigger>
          </TabsList>

          {/* 대화중 탭 */}
          <TabsContent value="chat" className="mt-4">
            <div className="space-y-4">
              {activeInterests.length > 0 ? (
                activeInterests.map((interest) => (
                  <ChatInterestCard
                    key={interest.id}
                    interest={interest}
                    isEnded={false}
                  />
                ))
              ) : (
                <EmptyChat />
              )}
            </div>
          </TabsContent>

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
    <Card className={`bg-[#1C1C1E] overflow-hidden ${isTerminal ? "border-neutral-800" : "won-card-accent won-card-glow border-neutral-800"}`}>
      <div className="p-5 space-y-4">
        {/* Status & ID */}
        <div className="flex justify-between items-center">
          <Badge
            className={`${config.className} font-black text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5`}
          >
            <StatusIcon className="w-3.5 h-3.5" />
            {config.label}
          </Badge>
          <span className="text-xs text-neutral-600 font-bold uppercase tracking-wider ml-auto">
            {auction.id.slice(0, 8).toUpperCase()}
          </span>
        </div>

        {/* Club Info */}
        <div className="space-y-1.5">
          <h2 className={`text-xl font-black tracking-tight ${isTerminal ? "text-white" : "text-amber-400"}`}>
            {auction.club?.name}
          </h2>
          <div className="flex items-center gap-2 text-xs text-neutral-500 font-bold">
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
        <div className="bg-neutral-900/50 rounded-2xl p-4 border border-neutral-800/50">
          <div className="flex justify-between items-center">
            <span className="text-neutral-500 text-sm font-bold">안내가</span>
            <span className="text-2xl font-black text-white">
              {formatPrice(auction.winning_price || auction.current_bid)}
            </span>
          </div>
          <p className="text-[11px] text-neutral-600 font-medium text-right mt-1">
            * 결제 방식은 MD 안내에 따라 진행
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
                  <p className="text-neutral-500 text-xs">리뷰를 남겨주세요</p>
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
                ? "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                : "bg-white text-black hover:bg-neutral-200"
            }`}
          >
            상세 내역 보기
            <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>

        {/* 낙찰 포기 / MD 미응답 신고 */}
        {isWonWaiting && (
          <div className="flex items-center justify-between pt-1 border-t border-neutral-800/50">
            <Link
              href={`/my-wins/${auction.id}/cancel`}
              className="flex items-center gap-1.5 py-2 px-1 group"
            >
              <XCircle className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
              <span className="text-xs text-neutral-500 font-medium group-hover:text-neutral-300 transition-colors">
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

function MyPuzzleCard({ puzzle, userId }: { puzzle: Puzzle; userId: string }) {
  const isLeader = puzzle.leader_id === userId;
  const isOpen = puzzle.status === "open";
  const confirmedBudget = puzzle.current_count * puzzle.budget_per_person;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${m}/${day} ${days[d.getDay()]}`;
  };

  const statusLabel: Record<string, string> = {
    open: "모집 중",
    matched: "마감",
    cancelled: "취소됨",
    expired: "만료됨",
  };

  return (
    <Link href={`/puzzles/${puzzle.id}`}>
      <Card className="bg-[#1C1C1E] border-neutral-800 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-black text-white">
            {formatDate(puzzle.event_date)} · {puzzle.area}
          </span>
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              isLeader
                ? "bg-amber-500/20 text-amber-400"
                : "bg-purple-500/20 text-purple-400"
            }`}
          >
            {isLeader ? "대표자" : "참여중"}
          </span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-neutral-400">
            {puzzle.current_count}/{puzzle.target_count}명 · 확정 {confirmedBudget.toLocaleString()}원
          </span>
          <span
            className={`font-bold ${
              isOpen ? "text-green-400" : "text-neutral-500"
            }`}
          >
            {statusLabel[puzzle.status] || puzzle.status}
          </span>
        </div>
        <div className="flex justify-end">
          <span className="text-[12px] text-neutral-500">
            {isLeader ? "[관리]" : "[보기]"} →
          </span>
        </div>
      </Card>
    </Link>
  );
}

function EmptyChat() {
  return (
    <div className="py-24 text-center space-y-4">
      <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
        <MessageCircle className="w-8 h-8 text-neutral-700" />
      </div>
      <p className="text-neutral-500 font-medium">
        대화중인 내역이 없습니다.
      </p>
      <Link href="/">
        <Button
          variant="link"
          className="text-neutral-400 font-bold underline"
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
      <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
        <Gavel className="w-8 h-8 text-neutral-700" />
      </div>
      <p className="text-neutral-500 font-medium">
        입찰중인 내역이 없습니다.
      </p>
      <Link href="/">
        <Button
          variant="link"
          className="text-neutral-400 font-bold underline"
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
      <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
        <Clock className="w-8 h-8 text-neutral-700" />
      </div>
      <p className="text-neutral-500 font-medium">
        낙찰/종료된 내역이 없습니다.
      </p>
    </div>
  );
}

function EmptyPuzzle() {
  return (
    <div className="py-24 text-center space-y-4">
      <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
        <span className="text-3xl">🧩</span>
      </div>
      <p className="text-neutral-500 font-medium">
        참여 중인 퍼즐이 없습니다.
      </p>
      <Link href="/?tab=puzzle">
        <Button variant="link" className="text-neutral-400 font-bold underline">
          퍼즐 둘러보기
        </Button>
      </Link>
    </div>
  );
}
