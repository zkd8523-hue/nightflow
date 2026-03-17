"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatTime, formatCountdown } from "@/lib/utils/format";
import { getEffectiveEndTime, isAuctionActive, isAuctionExpired } from "@/lib/utils/auction";
import { useCountdown } from "@/hooks/useCountdown";
import { AlertCircle, X, Trophy, ChevronRight } from "lucide-react";
import type { Bid, Auction, Club } from "@/types/database";

export interface BidWithAuction extends Bid {
  auction: Auction & { club?: Club };
}

type BidCardState = "highest" | "outbid" | "won" | "lost" | "cancelled" | "gave_up";

function deriveBidCardState(bid: BidWithAuction, userId: string): BidCardState {
  const auction = bid.auction;
  const active = auction.status === "active" && isAuctionActive(auction);

  if (active) {
    return auction.current_bid === bid.bid_amount ? "highest" : "outbid";
  }

  if (auction.winner_id === userId || bid.status === "won") return "won";
  if (bid.status === "cancelled") return "gave_up";
  if (["cancelled", "unsold"].includes(auction.status)) return "cancelled";

  // 만료됐지만 아직 close_auction() 미실행 (cron 갭) → 최고 입찰이면 "highest" 유지
  if (auction.status === "active" && isAuctionExpired(auction)) {
    return auction.current_bid === bid.bid_amount ? "highest" : "lost";
  }

  return "lost";
}

const BADGE_CONFIG: Record<BidCardState, { label: string; className: string }> = {
  highest: {
    label: "최고 입찰",
    className: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  outbid: {
    label: "추월됨",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  won: {
    label: "낙찰",
    className: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  lost: {
    label: "미낙찰",
    className: "bg-red-500/10 text-red-500 border-red-500/20",
  },
  cancelled: {
    label: "유찰",
    className: "bg-neutral-800 text-neutral-500 border-neutral-700",
  },
  gave_up: {
    label: "포기",
    className: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
};

interface MyBidCardProps {
  bid: BidWithAuction;
  userId: string;
  isEnded: boolean;
  onDismiss?: (auctionId: string) => void;
}

function CompactTimer({ endTime }: { endTime: string }) {
  const { remaining, level } = useCountdown(endTime);

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
        level === "critical"
          ? "bg-red-500/20 border-red-500/50"
          : level === "warning"
            ? "bg-amber-500/10 border-amber-500/30"
            : "bg-neutral-800 border-neutral-700"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          level === "critical" ? "bg-red-500" : level === "warning" ? "bg-amber-500" : "bg-green-500"
        } animate-pulse`}
      />
      <span
        className={`text-[11px] font-mono font-bold tabular-nums ${
          level === "critical" ? "text-red-400" : level === "warning" ? "text-amber-400" : "text-neutral-300"
        }`}
      >
        {formatCountdown(remaining)}
      </span>
    </div>
  );
}

export function MyBidCard({ bid, userId, isEnded, onDismiss }: MyBidCardProps) {
  const auction = bid.auction;
  const state = deriveBidCardState(bid, userId);
  const badge = BADGE_CONFIG[state];
  const isActive = state === "highest" || state === "outbid";
  const endTime = getEffectiveEndTime(auction);

  const cardContent = (
    <Card className="bg-[#1C1C1E] border-neutral-800 p-5 hover:border-neutral-700 transition-all">
      <div className="space-y-4">
        {/* Header: Badge + Timer/Dismiss */}
        <div className="flex justify-between items-center">
          <Badge
            className={`${badge.className} font-black text-[10px] px-2 py-0.5 rounded-lg border uppercase tracking-widest`}
          >
            {badge.label}
          </Badge>
          <div className="flex items-center gap-2">
            {isActive && <CompactTimer endTime={endTime} />}
            {!isActive && (
              <span className="text-[11px] text-neutral-600 font-bold">
                {formatTime(bid.bid_at)}
              </span>
            )}
            {isEnded && onDismiss && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDismiss(bid.auction_id);
                }}
                className="p-1 rounded-md hover:bg-neutral-800 transition-colors text-neutral-600 hover:text-neutral-400"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Club Info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center font-black text-neutral-600 text-sm">
            {auction.club?.name?.substring(0, 1)}
          </div>
          <div>
            <h2 className="text-white font-bold leading-tight">{auction.title}</h2>
            <p className="text-xs text-neutral-500">{auction.club?.area}</p>
          </div>
        </div>

        {/* Bid Info Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30">
            <p className="text-[10px] text-neutral-500 font-bold uppercase mb-1">
              내 입찰가
            </p>
            <p className="text-lg font-black text-white">
              {formatPrice(bid.bid_amount)}
            </p>
          </div>
          <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30">
            <p className="text-[10px] text-neutral-500 font-bold uppercase mb-1">
              {isEnded ? "최종 낙찰가" : "현재 최고가"}
            </p>
            <p
              className={`text-lg font-black ${
                state === "highest" || state === "won"
                  ? "text-green-500"
                  : state === "outbid"
                    ? "text-amber-500"
                    : "text-white"
              }`}
            >
              {formatPrice(auction.winning_price || auction.current_bid)}
            </p>
          </div>
        </div>

        {/* Outbid Alert */}
        {state === "outbid" && (
          <div className="flex items-center gap-2 text-amber-500 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold">
              다른 입찰자가 더 높은 금액을 불렀습니다!
            </span>
          </div>
        )}

        {/* CTA Button */}
        {state === "outbid" && (
          <Link href={`/auctions/${auction.id}`}>
            <Button className="w-full h-11 bg-white text-black font-black text-sm rounded-xl hover:bg-neutral-200">
              재입찰하기
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        )}
        {state === "highest" && (
          <Link href={`/auctions/${auction.id}`}>
            <Button className="w-full h-11 bg-neutral-800 text-neutral-300 font-bold text-sm rounded-xl hover:bg-neutral-700">
              경매 보기
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        )}
        {state === "won" && (
          <Link href={`/auctions/${auction.id}`}>
            <Button className="w-full h-11 bg-green-500/10 text-green-500 border border-green-500/20 font-bold text-sm rounded-xl hover:bg-green-500/20">
              <Trophy className="w-4 h-4 mr-1" />
              낙찰 상세보기
            </Button>
          </Link>
        )}
        {(state === "lost" || state === "gave_up") && (
          <Link href={`/auctions/${auction.id}`}>
            <Button className="w-full h-11 bg-neutral-800 text-neutral-400 font-bold text-sm rounded-xl hover:bg-neutral-700">
              상세보기
            </Button>
          </Link>
        )}
      </div>
    </Card>
  );

  // Active cards: entire card is clickable to auction detail
  if (isActive && state !== "outbid") {
    return <div className="cursor-pointer">{cardContent}</div>;
  }

  return cardContent;
}
