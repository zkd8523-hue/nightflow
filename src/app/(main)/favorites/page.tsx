"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFavoritesContext } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Heart,
  MapPin,
  Gavel,
} from "lucide-react";
import type { Auction } from "@/types/database";

export default function FavoritesPage() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { favorites, isLoading: favLoading, toggleFavorite } = useFavoritesContext();
  const router = useRouter();
  const supabase = createClient();

  const [auctionCounts, setAuctionCounts] = useState<Record<string, number>>({});

  // 각 찜한 클럽의 active/scheduled 경매 수 조회
  useEffect(() => {
    if (favorites.length === 0) return;

    const clubIds = favorites.map((f) => f.club_id);

    const fetchCounts = async () => {
      const { data } = await supabase
        .from("auctions")
        .select("club_id")
        .in("club_id", clubIds)
        .in("status", ["active", "scheduled"]);

      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((a: Pick<Auction, "club_id">) => {
          if (a.club_id) {
            counts[a.club_id] = (counts[a.club_id] || 0) + 1;
          }
        });
        setAuctionCounts(counts);
      }
    };

    fetchCounts();
  }, [favorites, supabase]);

  if (userLoading || favLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.push("/login?redirect=/favorites");
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </button>
          <h1 className="text-xl font-black text-white">찜한 클럽</h1>
          {favorites.length > 0 && (
            <span className="text-[13px] text-neutral-500">{favorites.length}개</span>
          )}
        </div>

        {favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Heart className="w-12 h-12 text-neutral-700 mb-4" />
            <p className="text-[15px] text-neutral-400 font-bold mb-2">
              아직 찜한 클럽이 없습니다
            </p>
            <p className="text-[13px] text-neutral-600 mb-6">
              경매 카드에서 하트를 눌러 클럽을 찜해보세요
            </p>
            <Link
              href="/"
              className="h-10 px-6 rounded-full bg-white text-black font-bold text-[14px] inline-flex items-center hover:bg-neutral-200 transition-colors"
            >
              경매 둘러보기
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {favorites.map((fav) => {
              const club = fav.club;
              if (!club) return null;

              const liveCount = auctionCounts[club.id] || 0;

              return (
                <div
                  key={fav.id}
                  className="bg-[#1C1C1E] rounded-2xl p-4 flex items-center gap-4"
                >
                  {/* 클럽 이미지 + 정보 (클릭 시 클럽 상세 이동) */}
                  <Link
                    href={`/clubs/${club.id}`}
                    className="flex items-center gap-4 flex-1 min-w-0"
                  >
                    {/* 클럽 이미지 */}
                    <div className="w-14 h-14 rounded-xl bg-neutral-800 overflow-hidden shrink-0 relative">
                      {club.thumbnail_url ? (
                        <Image
                          src={club.thumbnail_url}
                          alt={club.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-[18px] font-black text-neutral-600">
                            {club.name.charAt(0)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 클럽 정보 */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[15px] font-bold text-white truncate">
                        {club.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {club.area && (
                          <span className="flex items-center gap-0.5 text-[12px] text-neutral-500">
                            <MapPin className="w-3 h-3" />
                            {club.area}
                          </span>
                        )}
                        {liveCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[11px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                            <Gavel className="w-3 h-3" />
                            경매 {liveCount}건
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  {/* 찜 해제 버튼 */}
                  <button
                    onClick={() => toggleFavorite(club.id)}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-neutral-800/50 hover:bg-red-500/10 transition-colors shrink-0"
                    title="찜 해제"
                  >
                    <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
