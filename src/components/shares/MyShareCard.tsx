"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Auction } from "@/types/database";
import { formatNumber } from "@/lib/utils/format";
import { Users, ExternalLink, Loader2, X } from "lucide-react";
import dayjs from "dayjs";
import { trackShareEvent } from "@/lib/analytics/events";

interface MyShareCardProps {
  auction: Auction;
  onCancelled: () => void;
}

export function MyShareCard({ auction, onCancelled }: MyShareCardProps) {
  const supabase = createClient();
  const [cancelLoading, setCancelLoading] = useState(false);

  const club = auction.club;
  const totalFilled = (auction.seats_claimed ?? 0) + (auction.external_attendees ?? 0);
  const totalSeats = auction.total_seats ?? 0;
  const isFull = totalFilled >= totalSeats;
  const isExpired = auction.share_deadline ? dayjs().isAfter(dayjs(auction.share_deadline)) : false;
  const isActive = auction.status === "active";

  const handleOpenChat = async () => {
    const { data: md } = await supabase
      .from("users")
      .select("kakao_open_chat_url")
      .eq("id", auction.md_id)
      .single();
    trackShareEvent('share_kakao_open', {
      auction_id: auction.id,
      club_id: auction.club_id,
      has_kakao_url: !!md?.kakao_open_chat_url,
      source: 'my_shares',
    });
    if (md?.kakao_open_chat_url) {
      window.open(md.kakao_open_chat_url, "_blank");
    } else {
      toast.error("오픈채팅 정보를 불러올 수 없습니다.");
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      const { data, error } = await supabase.rpc("cancel_share_claim", {
        p_auction_id: auction.id,
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error("취소 중 문제가 발생했습니다.");
        return;
      }
      toast.success("참여가 취소되었습니다.");
      trackShareEvent('share_cancel', {
        auction_id: auction.id,
        club_id: auction.club_id,
        source: 'my_shares',
      });
      onCancelled();
    } catch {
      toast.error("네트워크 연결이 불안정합니다.");
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-foreground text-base">{club?.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {auction.main_alcohol ? `${auction.main_alcohol} · ` : ""}
            마감 {auction.share_deadline ? dayjs(auction.share_deadline).format("M/D HH:mm") : "-"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-foreground">
            {formatNumber(auction.price_per_seat ?? 0)}원
            <span className="text-muted-foreground font-normal text-xs"> /인</span>
          </div>
        </div>
      </div>

      {/* 좌석 진행 */}
      <div className="flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{totalFilled}/{totalSeats}명</span>
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isFull ? "bg-amber-500" : "bg-white"}`}
            style={{ width: `${totalSeats > 0 ? Math.min(100, (totalFilled / totalSeats) * 100) : 0}%` }}
          />
        </div>
        {isExpired && <span className="text-xs text-muted-foreground">마감</span>}
        {isFull && !isExpired && <span className="text-xs text-brand-amber font-bold">만석</span>}
      </div>

      {/* 액션 */}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 h-9 rounded-xl bg-amber-500/15 text-brand-amber border border-amber-500/30 hover:bg-amber-500/25 text-xs font-bold"
          onClick={handleOpenChat}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1" />
          오픈채팅 입장
        </Button>
        {isActive && !isExpired && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 px-3 text-muted-foreground hover:text-red-400 rounded-xl"
            disabled={cancelLoading}
            onClick={handleCancel}
          >
            {cancelLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}
