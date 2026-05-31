"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFavoritesContext } from "@/components/providers";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Heart, Wine } from "lucide-react";
import type { UserFavoriteClub, HotdealBenefitsByDow, HotdealDow } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import {
  normalizeDowSlots,
  summarizeSlots,
  benefitLabel,
  getActiveWeekStartISO,
  getBusinessDowKey,
} from "@/lib/utils/hotdeal";
import { getOpeningStatus } from "@/lib/clubs/openingStatus";

type GuestSign = { text: string; tags: string[] };

function useGuestSigns(clubIds: string[]): Record<string, GuestSign> {
  const [signs, setSigns] = useState<Record<string, GuestSign>>({});
  // clubIds 배열 정체성이 매 렌더 바뀌므로 정렬된 키 문자열로 의존성 고정
  const key = useMemo(() => [...clubIds].sort().join(","), [clubIds]);

  useEffect(() => {
    if (clubIds.length === 0) {
      setSigns({});
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const thisWeekISO = getActiveWeekStartISO();
      const todayDowKey = getBusinessDowKey();
      const { data } = await supabase
        .from("weekly_hotdeal_slots")
        .select("club_id, benefits_by_dow")
        .eq("week_start", thisWeekISO)
        .in("club_id", clubIds);

      if (cancelled) return;

      const map: Record<string, GuestSign> = {};
      for (const s of (data ?? []) as Array<{
        club_id: string;
        benefits_by_dow: HotdealBenefitsByDow | null;
      }>) {
        if (!s.club_id) continue;
        const todaySlots = normalizeDowSlots((s.benefits_by_dow ?? {})[todayDowKey as HotdealDow]);
        const summary = summarizeSlots(todaySlots);
        const tagSet = new Set<string>();
        for (const slot of todaySlots) {
          for (const b of slot.benefits ?? []) tagSet.add(b);
        }
        if (summary || tagSet.size > 0) {
          map[s.club_id] = { text: summary, tags: [...tagSet] };
        }
      }
      setSigns(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return signs;
}

function ClubFavoriteList({ items }: { items: UserFavoriteClub[] }) {
  const [openOnly, setOpenOnly] = useState(false);
  const clubIds = useMemo(
    () => items.map((f) => f.club?.id).filter((id): id is string => !!id),
    [items]
  );
  const guestSigns = useGuestSigns(clubIds);

  // 영업중 클럽 수 (필터 토글 라벨/노출 판단용)
  const openCount = useMemo(
    () =>
      items.filter(
        (f) => f.club && getOpeningStatus(f.club.operating_hours) === "open"
      ).length,
    [items]
  );

  const visibleItems = useMemo(
    () =>
      openOnly
        ? items.filter(
            (f) => f.club && getOpeningStatus(f.club.operating_hours) === "open"
          )
        : items,
    [items, openOnly]
  );

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-neutral-500">
        찜한 클럽이 없어요. 클럽 카드의 하트 버튼으로 찜해보세요.
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-24">
      {/* 영업중만 보기 필터 */}
      {openCount > 0 && (
        <div className="flex justify-end -mt-1">
          <button
            type="button"
            onClick={() => setOpenOnly((v) => !v)}
            className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-[12px] font-bold transition-colors ${
              openOnly
                ? "bg-green-500 text-black"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${openOnly ? "bg-black" : "bg-green-500"}`}
            />
            영업중만 보기
          </button>
        </div>
      )}

      {visibleItems.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-neutral-500">
          지금 영업 중인 찜한 클럽이 없어요.
        </div>
      ) : (
        visibleItems.map((fav) => {
        const club = fav.club;
        if (!club) return null;
        const sign = guestSigns[club.id];
        const openStatus = getOpeningStatus(club.operating_hours);
        const isOpen = openStatus === "open";
        return (
          <Link
            key={fav.id}
            href={`/clubs/${club.id}`}
            className="group flex gap-3 p-2 rounded-2xl bg-[#1C1C1E] active:bg-[#252527] transition-colors"
          >
            {/* 썸네일 */}
            <div className="relative w-[88px] h-[88px] flex-shrink-0 rounded-xl overflow-hidden bg-neutral-900">
              {club.thumbnail_url ? (
                <Image
                  src={club.thumbnail_url}
                  alt={club.name}
                  fill
                  sizes="88px"
                  className="object-cover group-active:scale-95 transition-transform"
                />
              ) : (
                <ClubImageFallback name={club.name} />
              )}
              {club.drink_menu_url && (
                <div className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/60 backdrop-blur-sm px-1 py-0.5 rounded-full">
                  <Wine className="w-2.5 h-2.5 text-amber-400" />
                  <span className="text-[8px] font-bold text-amber-400">주대표</span>
                </div>
              )}
            </div>

            {/* 정보 */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 py-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-white text-[15px] font-black truncate">{club.name}</p>
                {club.area && (
                  <span className="text-neutral-500 text-[11px] font-medium flex-shrink-0">
                    {club.area}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                  <span
                    className={`w-2 h-2 rounded-full ${isOpen ? "bg-green-500" : "bg-neutral-600"}`}
                  />
                  <span
                    className={`text-[10px] font-bold ${isOpen ? "text-green-500" : "text-neutral-500"}`}
                  >
                    {isOpen ? "영업중" : "영업종료"}
                  </span>
                </span>
              </div>

              {sign?.text && (
                <p className="text-amber-400 text-[12px] font-bold leading-snug line-clamp-2">
                  {sign.text}
                </p>
              )}

              {sign && sign.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {sign.tags.slice(0, 3).map((tag) => {
                    const { label, emoji } = benefitLabel(tag);
                    return (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px] font-black leading-none"
                      >
                        {emoji} {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </Link>
        );
        })
      )}
    </div>
  );
}

function ClubImageFallback({ name }: { name: string }) {
  const initial = name.trim().charAt(0);
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % 4;
  const gradients = [
    "from-amber-900/40 via-neutral-900 to-black",
    "from-purple-900/40 via-neutral-900 to-black",
    "from-rose-900/40 via-neutral-900 to-black",
    "from-emerald-900/40 via-neutral-900 to-black",
  ];
  return (
    <div className={`w-full h-full bg-gradient-to-br ${gradients[hash]} flex items-center justify-center`}>
      <span className="text-[40px] font-black text-white/40 select-none">{initial}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Heart className="w-12 h-12 text-neutral-700 mb-4" />
      <p className="text-[15px] text-neutral-400 font-bold mb-2">아직 찜한 클럽이 없어요</p>
      <p className="text-[13px] text-neutral-600 mb-6">
        클럽 카드의 하트 버튼으로 찜해보세요.
      </p>
      <Link
        href="/clubs"
        className="h-10 px-5 rounded-full bg-neutral-800 text-white font-bold text-[14px] inline-flex items-center hover:bg-neutral-700 transition-colors"
      >
        클럽 둘러보기
      </Link>
    </div>
  );
}

export default function FavoritesPage() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { favorites: favoriteClubs, isLoading: clubFavLoading } = useFavoritesContext();
  const router = useRouter();

  if (userLoading || clubFavLoading) {
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
          <h1 className="text-xl font-black text-white">찜</h1>
          {favoriteClubs.length > 0 && (
            <span className="text-[13px] text-neutral-500">{favoriteClubs.length}개</span>
          )}
        </div>

        {favoriteClubs.length === 0 ? (
          <EmptyState />
        ) : (
          <ClubFavoriteList items={favoriteClubs} />
        )}
      </div>
    </div>
  );
}
