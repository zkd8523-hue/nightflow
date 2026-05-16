"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Auction } from "@/types/database";
import { formatNumber } from "@/lib/utils/format";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { Users } from "lucide-react";

dayjs.locale("ko");

interface ShareHistoryListProps {
  mdId: string;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export function ShareHistoryList({ mdId }: ShareHistoryListProps) {
  const supabase = createClient();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("auctions")
      .select("*, club:clubs(name)")
      .eq("md_id", mdId)
      .eq("listing_type", "share")
      .in("status", ["won", "unsold", "confirmed"])
      .order("share_deadline", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setAuctions((data ?? []) as Auction[]);
        setLoading(false);
      });
  }, [mdId]);

  if (loading) return null;
  if (auctions.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-neutral-400 flex items-center gap-1.5">
        <Users className="w-4 h-4" />
        조각 운영 이력
      </h3>
      <div className="space-y-1.5">
        {auctions.map((auction) => {
          const date = auction.share_deadline ? dayjs(auction.share_deadline) : null;
          const dateStr = date
            ? `${date.month() + 1}월 ${date.date()}일(${WEEKDAY[date.day()]})`
            : "-";
          const nfFilled = auction.seats_claimed ?? 0;
          const external = auction.external_attendees ?? 0;
          const total = auction.total_seats ?? 0;
          const alcohol = auction.main_alcohol;
          const priceStr = auction.price_per_seat
            ? `${Math.round(auction.price_per_seat / 10000)}만원`
            : "";

          return (
            <div key={auction.id} className="text-xs text-neutral-500 bg-neutral-900 rounded-lg px-3 py-2">
              <span className="text-neutral-300 font-medium">{dateStr}</span>
              {" · "}
              <span>{auction.club?.name}</span>
              {alcohol && <span> · {alcohol}</span>}
              {" · "}
              <span className="text-amber-400 font-semibold">
                {priceStr} {nfFilled}/{total}
                {external > 0 && <span className="text-neutral-400"> +{external}(외부)</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
