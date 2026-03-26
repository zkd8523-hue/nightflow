"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, MapPin, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AuctionList } from "@/components/auctions/AuctionList";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import type { Club, Auction } from "@/types/database";

interface ClubDetailContentProps {
  club: Club;
  activeAuctions: Auction[];
  completedAuctions: Auction[];
}

export function ClubDetailContent({
  club,
  activeAuctions,
  completedAuctions,
}: ClubDetailContentProps) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const supabase = createClient();

  const [isMapOpen, setIsMapOpen] = useState(false);
  const [userBidMap, setUserBidMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!user || activeAuctions.length === 0) {
      setUserBidMap(new Map());
      return;
    }
    const fetchUserBids = async () => {
      const { data } = await supabase
        .from("bids")
        .select("auction_id, bid_amount")
        .eq("bidder_id", user.id)
        .in("auction_id", activeAuctions.map((a) => a.id))
        .order("bid_amount", { ascending: false });
      if (data) {
        const map = new Map<string, number>();
        for (const bid of data) {
          if (!map.has(bid.auction_id)) map.set(bid.auction_id, bid.bid_amount);
        }
        setUserBidMap(map);
      }
    };
    fetchUserBids();
  }, [user, activeAuctions, supabase]);

  return (
    <div className="container mx-auto max-w-lg px-4 py-4 mb-20">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-neutral-400" />
        </button>
        <h1 className="text-xl font-black text-white truncate flex-1">
          {club.name}
        </h1>
        <FavoriteButton clubId={club.id} />
      </div>

      {/* 클럽 정보 카드 */}
      <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden mb-6">
        {club.thumbnail_url && (
          <div className="relative w-full h-[180px]">
            <Image
              src={club.thumbnail_url}
              alt={club.name}
              fill
              className="object-cover"
            />
          </div>
        )}

        <div className="p-4 space-y-2">
          {club.area && (
            <span className="flex items-center gap-1 text-[13px] text-neutral-400">
              <MapPin className="w-3.5 h-3.5" />
              {club.area}
            </span>
          )}

          {club.address && (
            <p className="text-[12px] text-neutral-500">{club.address}</p>
          )}

          {(club.address || club.name) && (
            <button
              onClick={() => setIsMapOpen(true)}
              className="flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-white transition-colors mt-1"
            >
              <MapPin className="w-3.5 h-3.5" />
              지도에서 보기
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 경매 목록 */}
      <AuctionList
        activeAuctions={activeAuctions}
        completedAuctions={completedAuctions}
        userBidMap={userBidMap}
      />

      {/* 지도 앱 선택 Sheet (AuctionCard 패턴) */}
      <Sheet open={isMapOpen} onOpenChange={setIsMapOpen}>
        <SheetContent
          side="bottom"
          className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl pb-8"
        >
          <SheetHeader className="pb-2">
            <SheetTitle className="text-white text-[16px]">
              {club.name} 위치 확인
            </SheetTitle>
            {club.address && (
              <p className="text-[13px] text-neutral-400">{club.address}</p>
            )}
          </SheetHeader>
          <div className="flex flex-col gap-3 mt-4">
            <button
              onClick={() => {
                const query = encodeURIComponent(club.address || club.name);
                window.open(
                  `https://map.naver.com/v5/search/${query}`,
                  "_blank"
                );
                setIsMapOpen(false);
              }}
              className="flex items-center gap-3 p-4 bg-[#0A0A0A] rounded-2xl border border-neutral-800 hover:border-green-500/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[18px] font-bold text-green-500">N</span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-[15px] font-bold text-white">네이버지도</p>
                <p className="text-[12px] text-neutral-400">
                  네이버지도에서 열기
                </p>
              </div>
              <ExternalLink className="w-4 h-4 text-neutral-500" />
            </button>

            <button
              onClick={() => {
                const query = encodeURIComponent(club.address || club.name);
                window.open(
                  `https://map.kakao.com/link/search/${query}`,
                  "_blank"
                );
                setIsMapOpen(false);
              }}
              className="flex items-center gap-3 p-4 bg-[#0A0A0A] rounded-2xl border border-neutral-800 hover:border-yellow-500/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[18px] font-bold text-yellow-500">
                  K
                </span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-[15px] font-bold text-white">카카오맵</p>
                <p className="text-[12px] text-neutral-400">
                  카카오맵에서 열기
                </p>
              </div>
              <ExternalLink className="w-4 h-4 text-neutral-500" />
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
