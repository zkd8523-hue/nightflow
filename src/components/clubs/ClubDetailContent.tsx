"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, MapPin, ExternalLink, Instagram } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AuctionList } from "@/components/auctions/AuctionList";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";
import { DrinkMenuViewer } from "./DrinkMenuViewer";
import { FEATURE_GROUPS, getTagsByGroup } from "@/lib/clubs/tags";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import type { Club, Auction } from "@/types/database";
import { adjustMockAuctionDates } from "@/lib/utils/mockDates";

interface ClubDetailContentProps {
  club: Club;
  activeAuctions: Auction[];
}

export function ClubDetailContent({
  club,
  activeAuctions: rawActiveAuctions,
}: ClubDetailContentProps) {
  const activeAuctions = useMemo(() => {
    return rawActiveAuctions.map(adjustMockAuctionDates);
  }, [rawActiveAuctions]);

  const router = useRouter();
  const { user } = useCurrentUser();
  const supabase = createClient();

  const [isMapOpen, setIsMapOpen] = useState(false);
  const [userBidMap, setUserBidMap] = useState<Map<string, number>>(new Map());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setUserBidMap(new Map());
      setBlockedUserIds(new Set());
      return;
    }
    const fetchAll = async () => {
      const auctionIds = activeAuctions.map((a) => a.id);
      const [bidsResult, blocksResult] = await Promise.all([
        auctionIds.length > 0
          ? supabase
              .from("bids")
              .select("auction_id, bid_amount")
              .eq("bidder_id", user.id)
              .in("auction_id", auctionIds)
              .order("bid_amount", { ascending: false })
          : Promise.resolve({ data: [] as { auction_id: string; bid_amount: number }[] }),
        supabase.from("user_blocks").select("blocked_id").eq("blocker_id", user.id),
      ]);
      if (bidsResult.data) {
        const map = new Map<string, number>();
        for (const bid of bidsResult.data) {
          if (!map.has(bid.auction_id)) map.set(bid.auction_id, bid.bid_amount);
        }
        setUserBidMap(map);
      }
      if (blocksResult.data) {
        setBlockedUserIds(
          new Set(blocksResult.data.map((d: { blocked_id: string }) => d.blocked_id))
        );
      }
    };
    fetchAll();
  }, [user, activeAuctions, supabase]);

  // 차단한 MD의 매물 숨김 (Apple Guideline 1.2 일관성)
  const visibleAuctions = useMemo(() => {
    if (blockedUserIds.size === 0) return activeAuctions;
    return activeAuctions.filter(
      (a) => !a.md_id || !blockedUserIds.has(a.md_id)
    );
  }, [activeAuctions, blockedUserIds]);

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
            <span className="text-[13px] text-neutral-400">
              {club.area}
            </span>
          )}

          {(club.address || club.name) && (
            <div className="flex items-center gap-3 flex-wrap">
              {club.address && (
                <p className="text-[12px] text-neutral-500">{club.address}</p>
              )}
              <button
                onClick={() => setIsMapOpen(true)}
                className="flex items-center gap-1 text-[12px] text-neutral-400 hover:text-white transition-colors"
              >
                <MapPin className="w-3.5 h-3.5" />
                지도에서 보기
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}

          {club.instagram && (
            <a
              href={`https://instagram.com/${club.instagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-pink-400 transition-colors mt-1"
            >
              <Instagram className="w-3.5 h-3.5" />
              @{club.instagram}
            </a>
          )}

          {(club.tags?.length ?? 0) > 0 && (
            <div className="pt-2 mt-2 border-t border-neutral-800 space-y-1.5">
              {FEATURE_GROUPS.map((g) => {
                const tags = getTagsByGroup(club.tags || [], g.group);
                if (tags.length === 0) return null;
                return (
                  <div
                    key={g.group}
                    className="flex items-center gap-2 text-[12px]"
                  >
                    <span className="text-neutral-500 w-14 flex-shrink-0">
                      {g.emoji} {g.label}
                    </span>
                    <span className="text-neutral-200">
                      {tags.map((t) => t.label).join(" · ")}
                    </span>
                  </div>
                );
              })}
              {(() => {
                const genres = getTagsByGroup(club.tags || [], "genre");
                if (genres.length === 0) return null;
                return (
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="text-neutral-500 w-14 flex-shrink-0">
                      🎵 음악
                    </span>
                    <span className="text-neutral-200">
                      {genres.map((t) => `#${t.label}`).join(" ")}
                    </span>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {club.drink_menu_url && (
          <div className="p-4 pt-0">
            <DrinkMenuViewer
              url={club.drink_menu_url}
              updatedAt={club.drink_menu_updated_at}
              clubName={club.name}
            />
          </div>
        )}
      </div>

      {/* 경매 목록 */}
      <AuctionList
        activeAuctions={visibleAuctions}
        userBidMap={userBidMap}
        hideTabs
        hideAreaFilter
        initialTab="share"
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
