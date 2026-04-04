"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MyBidCard, type BidWithAuction } from "./MyBidCard";
import { MyBidCardContact } from "./MyBidCardContact";
import { ReportMDButton } from "./ReportMDButton";
import { useMyBidsRealtime, type AuctionUpdate } from "@/hooks/useMyBidsRealtime";
import { isAuctionActive, isAuctionExpired } from "@/lib/utils/auction";
import { formatPrice, formatEventDate, formatEntryTime } from "@/lib/utils/format";
import type { Auction } from "@/types/database";
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

interface MyBidsClientProps {
  initialBids: BidWithAuction[];
  initialWonAuctions?: WonAuctionData[];
  reportedAuctionIds?: string[];
  userId: string;
  initialTab?: string;
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
        label: isInstant ? "구매 완료! MD에게 연락하세요" : "낙찰! MD에게 연락하세요",
        className:
          "bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse",
        icon: Phone,
      };
    case "contacted":
      return {
        label: "연락 완료",
        className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
        icon: CheckCircle2,
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
  reportedAuctionIds = [],
  userId,
  initialTab,
}: MyBidsClientProps) {
  const [bids, setBids] = useState<BidWithAuction[]>(initialBids);
  const [wonAuctions, setWonAuctions] =
    useState<WonAuctionData[]>(initialWonAuctions);
  const [dismissedIds, setDismissedIds] =
    useState<Set<string>>(loadDismissedIds);
  const reportedSet = useMemo(
    () => new Set(reportedAuctionIds),
    [reportedAuctionIds]
  );

  const defaultTab = initialTab === "won" ? "won" : initialTab === "ended" ? "ended" : "active";

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

    const sorted = Array.from(auctionMap.values()).sort(
      (a, b) =>
        new Date(b.won_at || b.updated_at).getTime() -
        new Date(a.won_at || a.updated_at).getTime()
    );

    setWonAuctions(sorted);
  }, []);

  useEffect(() => {
    fetchBids();
    fetchWonAuctions();

    const handleFocus = () => {
      fetchBids();
      fetchWonAuctions();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchBids, fetchWonAuctions]);

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

  // 만료 경매 즉시 close_auction() 호출 (cron 대기 없이 즉시 처리)
  const closedAuctionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const expiredActive = bids.filter(
      (b) =>
        b.auction.status === "active" &&
        isAuctionExpired(b.auction) &&
        !closedAuctionsRef.current.has(b.auction_id)
    );

    if (expiredActive.length === 0) return;

    const supabase = createClient();

    for (const bid of expiredActive) {
      closedAuctionsRef.current.add(bid.auction_id);

      supabase
        .rpc("close_auction", { p_auction_id: bid.auction_id })
        .then(({ error }) => {
          if (error) {
            // cron이 먼저 처리한 경우 "이미 종료된 경매입니다" → 정상
            console.debug(`[close_auction] ${bid.auction_id}: ${error.message}`);
          }
          // 성공/실패 모두 refetch (cron이 먼저 처리했어도 최신 데이터 필요)
          fetchBids();
          fetchWonAuctions();
        });
    }
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

  // 낙찰 탭: 긴급 액션 필요한 낙찰 (won, contacted) — 만료된 것 제외
  const activeWonAuctions = useMemo(
    () =>
      wonAuctions.filter((a) =>
        ["won", "contacted"].includes(getEffectiveStatus(a))
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

  // 삭제된 항목 + 낙찰 경매 필터링 (낙찰탭에 이미 표시되므로 종료탭에서 제외)
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

  // 낙찰 탭에 긴급 카드가 있으면 배지 펄스
  const hasUrgentWon = activeWonAuctions.some((a) => a.status === "won");

  return (
    <div className="min-h-screen bg-[#0A0A0A] pt-16 pb-32">
      <div className="max-w-lg mx-auto px-4">
        <header className="py-8 space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tighter">
            내 활동
          </h1>
          <p className="text-neutral-500 font-medium">
            입찰, 구매, 종료된 내역을 한곳에서 확인하세요.
          </p>
        </header>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="w-full bg-[#1C1C1E] rounded-xl p-1 border border-neutral-800">
            <TabsTrigger
              value="active"
              className="flex-1 rounded-lg text-[13px] font-bold data-[state=active]:bg-white data-[state=active]:text-black text-neutral-500"
            >
              진행 중{activeBids.length > 0 && ` (${activeBids.length})`}
            </TabsTrigger>
            <TabsTrigger
              value="won"
              className="flex-1 rounded-lg text-[13px] font-bold data-[state=active]:bg-white data-[state=active]:text-black text-neutral-500 relative"
            >
              <span className={hasUrgentWon ? "text-amber-500 data-[state=active]:text-black" : ""}>
                낙찰/구매
                {activeWonAuctions.length > 0 &&
                  ` (${activeWonAuctions.length})`}
              </span>
              {hasUrgentWon && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="ended"
              className="flex-1 rounded-lg text-[13px] font-bold data-[state=active]:bg-white data-[state=active]:text-black text-neutral-500"
            >
              종료
              {(visibleEndedBids.length + completedWonAuctions.length) > 0 &&
                ` (${visibleEndedBids.length + completedWonAuctions.length})`}
            </TabsTrigger>
          </TabsList>

          {/* 진행 중 탭 */}
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

          {/* 낙찰 탭 */}
          <TabsContent value="won" className="mt-4">
            <div className="space-y-4">
              {activeWonAuctions.length > 0 ? (
                activeWonAuctions.map((auction) => (
                  <WonAuctionCard
                    key={auction.id}
                    auction={auction}
                    reportedSet={reportedSet}
                  />
                ))
              ) : (
                <EmptyWon />
              )}
            </div>
          </TabsContent>

          {/* 종료 탭 */}
          <TabsContent value="ended" className="mt-4">
            <div className="space-y-4">
              {/* 완료된 낙찰 (confirmed, expired, cancelled) */}
              {completedWonAuctions.map((auction) => (
                <WonAuctionCard
                  key={`won-${auction.id}`}
                  auction={auction}
                  reportedSet={reportedSet}
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
              {completedWonAuctions.length === 0 &&
                visibleEndedBids.length === 0 && <EmptyEnded />}
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
          {effectiveStatus !== "contacted" && (
            <Badge
              className={`${config.className} font-black text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5`}
            >
              <StatusIcon className="w-3.5 h-3.5" />
              {config.label}
            </Badge>
          )}
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
            <span className="text-neutral-500 text-sm font-bold">{isInstant ? "구매가" : "낙찰가"}</span>
            <span className="text-2xl font-black text-white">
              {formatPrice(auction.winning_price || auction.current_bid)}
            </span>
          </div>
          <p className="text-[11px] text-neutral-600 font-medium text-right mt-1">
            * 결제 방식은 MD 안내에 따라 진행
          </p>
        </div>

        {/* Won/Contacted: Contact CTA */}
        {(isWonWaiting || auction.status === "contacted") && <MyBidCardContact auction={auction} />}

        {/* Expired: Warning */}
        {(auction.status === "expired" || isContactExpired) && (
          <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-red-500/80 font-bold leading-tight">
              연락 시간이 만료되어 {isInstant ? "구매가" : "낙찰이"} 취소되었습니다.
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
        {(isWonWaiting || effectiveStatus === "contacted") && (
          <div className="flex items-center justify-between pt-1 border-t border-neutral-800/50">
            <Link
              href={`/my-wins/${auction.id}/cancel`}
              className="flex items-center gap-1.5 py-2 px-1 group"
            >
              <XCircle className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
              <span className="text-xs text-neutral-500 font-medium group-hover:text-neutral-300 transition-colors">
                {isInstant ? "구매 포기" : "낙찰 포기"}
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

function EmptyActive() {
  return (
    <div className="py-24 text-center space-y-4">
      <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
        <Gavel className="w-8 h-8 text-neutral-700" />
      </div>
      <p className="text-neutral-500 font-medium">
        진행 중인 내역이 없습니다.
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

function EmptyWon() {
  return (
    <div className="py-24 text-center space-y-4">
      <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
        <Trophy className="w-8 h-8 text-neutral-700" />
      </div>
      <p className="text-neutral-500 font-medium">
        아직 확정된 내역이 없습니다.
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
        종료된 내역이 없습니다.
      </p>
    </div>
  );
}
