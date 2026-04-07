"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";
import type { AuctionStatus } from "@/types/database";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface AuctionActivity {
  id: string;
  status: AuctionStatus;
  start_price: number;
  current_bid: number;
  bid_count: number;
  created_at: string;
  auction_date: string | null;
  table_type: string | null;
  title: string | null;
  won_at: string | null;
  clubs: { name: string } | null;
  winner: { name: string } | null;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; dot: string; text: string }
> = {
  active: {
    label: "진행중",
    dot: "bg-green-500 animate-pulse",
    text: "text-green-500",
  },
  scheduled: { label: "예정", dot: "bg-amber-500", text: "text-amber-500" },
  won: { label: "낙찰", dot: "bg-green-500", text: "text-green-500" },
  confirmed: {
    label: "방문 확인",
    dot: "bg-green-500",
    text: "text-green-500",
  },
  unsold: { label: "유찰", dot: "bg-neutral-600", text: "text-neutral-500" },
  cancelled: { label: "취소", dot: "bg-red-500", text: "text-red-500" },
  draft: { label: "초안", dot: "bg-neutral-700", text: "text-neutral-600" },
  expired: { label: "만료", dot: "bg-neutral-600", text: "text-neutral-500" },
};

function getEventTime(auction: AuctionActivity): string {
  if (
    (auction.status === "won" || auction.status === "confirmed") &&
    auction.won_at
  ) {
    return dayjs(auction.won_at).fromNow();
  }
  return dayjs(auction.created_at).fromNow();
}

function getEventDescription(auction: AuctionActivity): string {
  const status = auction.status;
  if (status === "active") {
    return `시작가 ${formatPrice(auction.start_price)}${auction.current_bid > 0 ? ` · 현재 ${formatPrice(auction.current_bid)}` : ""}`;
  }
  if (status === "won" || status === "confirmed") {
    return `${formatPrice(auction.current_bid)}에 낙찰 · 입찰 ${auction.bid_count || 0}건`;
  }
  if (status === "unsold" || status === "expired") {
    return `유찰 · 입찰 ${auction.bid_count || 0}건`;
  }
  if (status === "cancelled") {
    return `취소됨`;
  }
  if (status === "scheduled") {
    return `시작가 ${formatPrice(auction.start_price)}`;
  }
  return `시작가 ${formatPrice(auction.start_price)}`;
}

export function MDActivityTimeline({ mdId }: { mdId: string }) {
  const [auctions, setAuctions] = useState<AuctionActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("auctions")
        .select(
          "id, status, start_price, current_bid, bid_count, created_at, auction_date, table_type, title, won_at, clubs(name), winner:users!winner_id(name)",
        )
        .eq("md_id", mdId)
        .order("created_at", { ascending: false })
        .limit(10);

      setAuctions((data as unknown as AuctionActivity[]) || []);
      setLoading(false);
    };

    fetchActivity();
  }, [mdId]);

  if (loading) {
    return (
      <div className="space-y-4 py-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-800 mt-1.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-neutral-800 rounded w-20" />
              <div className="h-4 bg-neutral-800 rounded w-40" />
              <div className="h-3 bg-neutral-800 rounded w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (auctions.length === 0) {
    return (
      <div className="py-6 text-center text-neutral-600 text-sm">
        최근 활동이 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {auctions.map((auction, index) => {
        const config = STATUS_CONFIG[auction.status] || STATUS_CONFIG.draft;
        const isLast = index === auctions.length - 1;

        return (
          <div key={auction.id} className="flex gap-3">
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={`w-2.5 h-2.5 rounded-full mt-1.5 ${config.dot}`}
              />
              {!isLast && (
                <div className="w-px flex-1 bg-neutral-800 my-1" />
              )}
            </div>

            {/* Content */}
            <div className={`pb-4 flex-1 ${isLast ? "" : ""}`}>
              <div className="text-[11px] text-neutral-600 mb-0.5">
                {getEventTime(auction)}
              </div>
              <div className="text-sm text-white font-medium">
                {auction.clubs?.name || "클럽 미지정"}
                {auction.table_type && (
                  <span className="text-neutral-500">
                    {" "}
                    · {auction.table_type}
                  </span>
                )}
              </div>
              <div className="text-xs text-neutral-400 mt-0.5">
                {getEventDescription(auction)}
                <span className={`ml-2 font-bold ${config.text}`}>
                  {config.label}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
