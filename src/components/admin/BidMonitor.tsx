"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Radio } from "lucide-react";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface BidFeedItem {
  id: string;
  auction_id: string;
  bidder_id: string;
  bid_amount: number;
  bid_at: string;
  auction_title?: string;
  club_name?: string;
  bidder_name?: string;
  suspicious?: boolean;
}

const MAX_FEED_ITEMS = 100;

export function BidMonitor() {
  const [bidFeed, setBidFeed] = useState<BidFeedItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const bidFrequencyRef = useRef<Map<string, number[]>>(new Map());

  const checkSuspicious = useCallback((bidderId: string, bidAt: string): boolean => {
    const now = new Date(bidAt).getTime();
    const fiveMinAgo = now - 5 * 60 * 1000;
    const timestamps = bidFrequencyRef.current.get(bidderId) || [];
    const recent = timestamps.filter((t) => t > fiveMinAgo);
    recent.push(now);
    bidFrequencyRef.current.set(bidderId, recent);
    return recent.length >= 3;
  }, []);

  useEffect(() => {
    const supabase = createClient();

    // 최근 50개 입찰 로드
    const loadRecentBids = async () => {
      const { data } = await supabase
        .from("bids")
        .select(
          "id, auction_id, bidder_id, bid_amount, bid_at, auction:auctions(title, club:clubs(name)), bidder:users!bids_bidder_id_fkey(name)"
        )
        .order("bid_at", { ascending: false })
        .limit(50);

      if (data) {
        const items: BidFeedItem[] = data.map((b: any) => ({
          id: b.id,
          auction_id: b.auction_id,
          bidder_id: b.bidder_id,
          bid_amount: b.bid_amount,
          bid_at: b.bid_at,
          auction_title: b.auction?.title,
          club_name: b.auction?.club?.name,
          bidder_name: b.bidder?.name,
          suspicious: false,
        }));
        setBidFeed(items);
      }
    };

    loadRecentBids();

    // Realtime 구독
    const channel = supabase
      .channel("admin-bid-monitor")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bids" },
        async (payload) => {
          const newBid = payload.new as {
            id: string;
            auction_id: string;
            bidder_id: string;
            bid_amount: number;
            bid_at: string;
          };

          const [auctionRes, bidderRes] = await Promise.all([
            supabase
              .from("auctions")
              .select("title, club:clubs(name)")
              .eq("id", newBid.auction_id)
              .single(),
            supabase
              .from("users")
              .select("name")
              .eq("id", newBid.bidder_id)
              .single(),
          ]);

          const isSuspicious = checkSuspicious(newBid.bidder_id, newBid.bid_at);

          const auctionData = auctionRes.data as unknown as { title?: string; club?: { name: string } | null };

          const feedItem: BidFeedItem = {
            id: newBid.id,
            auction_id: newBid.auction_id,
            bidder_id: newBid.bidder_id,
            bid_amount: newBid.bid_amount,
            bid_at: newBid.bid_at,
            auction_title: auctionData?.title,
            club_name: auctionData?.club?.name,
            bidder_name: bidderRes.data?.name,
            suspicious: isSuspicious,
          };

          setBidFeed((prev) => [feedItem, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checkSuspicious]);

  // 통계
  const todayStart = dayjs().startOf("day").toISOString();
  const todayBids = bidFeed.filter((b) => b.bid_at >= todayStart);
  const uniqueBidders = new Set(todayBids.map((b) => b.bidder_id)).size;
  const suspiciousCount = bidFeed.filter((b) => b.suspicious).length;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-black text-white">실시간 입찰 피드</h2>
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500 animate-pulse" : "bg-neutral-600"
              }`}
            />
            <span className="text-[11px] text-neutral-500 font-bold">
              {isConnected ? "LIVE" : "연결중..."}
            </span>
          </div>
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5">
          <p className="text-neutral-500 text-sm font-bold mb-1">오늘 입찰</p>
          <p className="text-3xl font-black text-white">{todayBids.length}건</p>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5">
          <p className="text-neutral-500 text-sm font-bold mb-1">고유 입찰자</p>
          <p className="text-3xl font-black text-white">{uniqueBidders}명</p>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5">
          <p className="text-neutral-500 text-sm font-bold mb-1">경고</p>
          <p className="text-3xl font-black text-amber-500">{suspiciousCount}건</p>
        </div>
      </div>

      {/* 입찰 피드 */}
      <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto divide-y divide-neutral-800/50">
          {bidFeed.length === 0 ? (
            <div className="py-24 text-center">
              <Radio className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-600 font-bold">입찰 내역이 없습니다</p>
              <p className="text-neutral-700 text-sm mt-1">
                새로운 입찰이 들어오면 여기에 표시됩니다
              </p>
            </div>
          ) : (
            bidFeed.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between p-4 transition-all ${
                  item.suspicious
                    ? "bg-amber-500/5"
                    : "hover:bg-neutral-900/50"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="text-[11px] text-neutral-600 font-mono w-16 shrink-0">
                    {dayjs(item.bid_at).format("HH:mm:ss")}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">
                      {item.club_name || "알 수 없음"}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {item.bidder_name || "익명"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {item.suspicious && (
                    <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] font-bold">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      주의
                    </Badge>
                  )}
                  <span className="font-black text-green-500 text-sm">
                    {formatPrice(item.bid_amount)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
