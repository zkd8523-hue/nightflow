"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCountdown } from "@/hooks/useCountdown";
import { formatPrice, formatEventDate, formatEntryTime } from "@/lib/utils/format";
import { MapPin, Calendar, Clock, Trophy, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface FallbackOfferCardProps {
  auction: {
    id: string;
    fallback_deadline: string;
    winning_price: number | null;
    current_bid: number;
    event_date: string;
    entry_time: string | null;
    table_info: string | null;
    club: { name: string; area: string } | null;
  };
  onAccepted: () => void;
  onDeclined: () => void;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function FallbackOfferCard({ auction, onAccepted, onDeclined }: FallbackOfferCardProps) {
  const [loading, setLoading] = useState<"accept" | "decline" | null>(null);
  const { remaining, level } = useCountdown(auction.fallback_deadline);

  const isExpired = remaining <= 0;
  const price = auction.winning_price ?? auction.current_bid;

  const urgencyColor = level === "critical"
    ? "text-red-400"
    : level === "warning"
    ? "text-amber-400"
    : "text-green-400";

  const handleAccept = async () => {
    setLoading("accept");
    try {
      const res = await fetch("/api/auction/accept-fallback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId: auction.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "수락에 실패했습니다.");
      toast.success("차순위 낙찰을 수락했습니다! MD에게 연락하세요.");
      onAccepted();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "수락에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  };

  const handleDecline = async () => {
    setLoading("decline");
    try {
      const res = await fetch("/api/auction/decline-fallback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId: auction.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "거절에 실패했습니다.");
      toast("차순위 제안을 거절했습니다. 패널티는 없습니다.");
      onDeclined();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "거절에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  };

  if (isExpired) {
    return (
      <Card className="bg-[#1C1C1E] border-neutral-800 overflow-hidden">
        <div className="p-5 space-y-3">
          <Badge className="bg-neutral-800 text-neutral-500 border-neutral-700 text-xs font-bold">
            제안 만료
          </Badge>
          <p className="text-neutral-500 text-sm font-medium">
            차순위 낙찰 제안이 만료되었습니다. 패널티는 없습니다.
          </p>
          <Link href={`/auctions/${auction.id}`}>
            <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-white w-full">
              경매 보기 <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-[#1C1C1E] border-amber-500/40 overflow-hidden shadow-lg shadow-amber-500/5">
      <div className="p-5 space-y-4">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-2">
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 font-black text-xs px-2.5 py-1 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            차순위 낙찰 제안
          </Badge>
          {/* 수락 카운트다운 */}
          <div className={`text-right ${urgencyColor}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">수락 마감</div>
            <div className={`text-lg font-black tabular-nums ${level === "critical" ? "animate-pulse" : ""}`}>
              {formatCountdown(remaining)}
            </div>
          </div>
        </div>

        {/* 클럽 정보 */}
        <div className="space-y-1.5">
          <h2 className="text-xl font-black text-amber-400 tracking-tight">
            {auction.club?.name}
          </h2>
          <div className="flex items-center gap-2 text-xs text-neutral-500 font-bold">
            <MapPin className="w-3 h-3" /> {auction.club?.area}
            <span>·</span>
            <Calendar className="w-3 h-3" /> {formatEventDate(auction.event_date)}
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-blue-400" />
            <span className="text-xs font-bold text-blue-400">
              {formatEntryTime(auction.entry_time, auction.event_date)}
            </span>
          </div>
        </div>

        {/* 가격 */}
        <div className="bg-neutral-900/60 rounded-2xl p-4 border border-neutral-800/50">
          <div className="flex justify-between items-center">
            <span className="text-neutral-500 text-sm font-bold">제안 금액</span>
            <span className="text-2xl font-black text-white">{formatPrice(price)}</span>
          </div>
          <p className="text-[11px] text-neutral-600 font-medium text-right mt-1">
            1순위 낙찰자가 연락하지 않아 기회가 왔습니다
          </p>
        </div>

        {/* 안내 */}
        <p className="text-[11px] text-neutral-500 leading-relaxed text-center">
          수락 시 MD 연락 타이머가 시작됩니다.{"\n"}
          거절하거나 시간이 지나도 <span className="text-white font-bold">패널티 없습니다.</span>
        </p>

        {/* 버튼 */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 h-11 border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-white font-bold rounded-xl"
            onClick={handleDecline}
            disabled={!!loading}
          >
            {loading === "decline" ? "처리중..." : "거절"}
          </Button>
          <Button
            className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-xl"
            onClick={handleAccept}
            disabled={!!loading}
          >
            {loading === "accept" ? "처리중..." : "수락하기"}
          </Button>
        </div>

        <Link href={`/auctions/${auction.id}`} className="block">
          <Button variant="ghost" size="sm" className="w-full text-neutral-600 hover:text-neutral-400 text-xs">
            경매 상세 보기 <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
