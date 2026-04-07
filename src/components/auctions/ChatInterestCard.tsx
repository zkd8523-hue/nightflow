"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatTime, formatCountdown } from "@/lib/utils/format";
import { getEffectiveEndTime, isAuctionActive } from "@/lib/utils/auction";
import { useCountdown } from "@/hooks/useCountdown";
import { MessageCircle, ChevronRight, X } from "lucide-react";
import { AuctionImage } from "@/components/auctions/DrinkPlaceholder";
import type { Auction, Club } from "@/types/database";

export interface ChatInterestWithAuction {
  id: string;
  auction_id: string;
  user_id: string;
  created_at: string;
  auction: Auction & { club?: Club };
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: {
    label: "대화중",
    className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  confirmed: {
    label: "거래 완료",
    className: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  unsold: {
    label: "판매 종료",
    className: "bg-neutral-800 text-neutral-500 border-neutral-700",
  },
  cancelled: {
    label: "취소",
    className: "bg-neutral-800 text-neutral-500 border-neutral-700",
  },
};

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

interface ChatInterestCardProps {
  interest: ChatInterestWithAuction;
  isEnded: boolean;
  onDismiss?: (auctionId: string) => void;
}

export function ChatInterestCard({ interest, isEnded, onDismiss }: ChatInterestCardProps) {
  const auction = interest.auction;
  const active = auction.status === "active" && isAuctionActive(auction);
  const endTime = getEffectiveEndTime(auction);
  const badgeKey = active ? "active" : (STATUS_BADGE[auction.status] ? auction.status : "unsold");
  const badge = STATUS_BADGE[badgeKey];

  return (
    <Card className="bg-[#1C1C1E] border-neutral-800 p-5 hover:border-neutral-700 transition-all">
      <div className="space-y-4">
        {/* Header: Badge + Timer/Dismiss */}
        <div className="flex justify-between items-center">
          <Badge
            className={`${badge.className} font-black text-[10px] px-2 py-0.5 rounded-lg border uppercase tracking-widest flex items-center gap-1`}
          >
            <MessageCircle className="w-3 h-3" />
            {badge.label}
          </Badge>
          <div className="flex items-center gap-2">
            {active && <CompactTimer endTime={endTime} />}
            {!active && (
              <span className="text-[11px] text-neutral-600 font-bold">
                {formatTime(interest.created_at)}
              </span>
            )}
            {isEnded && onDismiss && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDismiss(interest.auction_id);
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
          <div className="w-10 h-10 rounded-lg overflow-hidden relative flex-shrink-0 bg-neutral-900">
            <AuctionImage
              auctionThumbnail={auction.thumbnail_url}
              clubThumbnail={auction.club?.thumbnail_url}
              includes={auction.includes}
              alt={auction.club?.name || "클럽"}
              sizes="40px"
            />
          </div>
          <div>
            <h2 className="text-white font-bold leading-tight">{auction.club?.name}</h2>
            <p className="text-xs text-neutral-500">{auction.club?.area}</p>
          </div>
        </div>

        {/* Price */}
        <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30">
          <p className="text-[10px] text-neutral-500 font-bold uppercase mb-1">
            판매가
          </p>
          <p className="text-lg font-black text-white">
            {formatPrice(auction.start_price)}
          </p>
        </div>

        {/* CTA */}
        <Link href={`/auctions/${auction.id}`}>
          <Button
            className={`w-full h-11 font-black text-sm rounded-xl flex items-center justify-center gap-1 ${
              active
                ? "bg-white text-black hover:bg-neutral-200"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
          >
            상세보기
            <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
