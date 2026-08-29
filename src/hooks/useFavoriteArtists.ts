"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { getErrorMessage, logError } from "@/lib/utils/error";
import type { UserFavoriteArtist } from "@/types/database";

/**
 * 아티스트 찜. useFavoriteDjs(570)와 같은 패턴의 4번째 인스턴스
 * (070 클럽 · 083 MD · 570 DJ · 608 아티스트).
 *
 * 이 찜은 "찜한 아티스트만 보기"(필터)가 아니라 /events 목록에서 날짜 그룹 안의
 * 정렬 우선순위로 쓴다 — 찜 안 한 공연도 계속 목록에 남는다.
 */
export function useFavoriteArtists(userId: string | undefined) {
  const [favoriteArtists, setFavoriteArtists] = useState<UserFavoriteArtist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!userId) {
      setFavoriteArtists([]);
      setIsLoading(false);
      return;
    }

    const fetchFavoriteArtists = async () => {
      const { data } = await supabase
        .from("user_favorite_artists")
        .select("*, artist:artists(id, display_name, slug, instagram, photo_url)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      setFavoriteArtists((data as UserFavoriteArtist[]) || []);
      setIsLoading(false);
    };

    fetchFavoriteArtists();
  }, [userId, supabase]);

  const favoriteArtistIds = useMemo(
    () => new Set(favoriteArtists.map((f) => f.artist_id)),
    [favoriteArtists]
  );

  const isFavoritedArtist = useCallback(
    (artistId: string) => favoriteArtistIds.has(artistId),
    [favoriteArtistIds]
  );

  const toggleFavoriteArtist = useCallback(
    async (artistId: string) => {
      if (!userId) {
        toast.error("로그인이 필요합니다");
        return;
      }

      const currentlyFavorited = favoriteArtistIds.has(artistId);

      try {
        if (currentlyFavorited) {
          await supabase
            .from("user_favorite_artists")
            .delete()
            .eq("user_id", userId)
            .eq("artist_id", artistId);

          setFavoriteArtists((prev) => prev.filter((f) => f.artist_id !== artistId));
          toast.success("아티스트 찜이 해제되었습니다");
        } else {
          const { data, error } = await supabase
            .from("user_favorite_artists")
            .insert({ user_id: userId, artist_id: artistId })
            .select("*, artist:artists(id, display_name, slug, instagram, photo_url)")
            .single();

          if (error) {
            if (error.code === "23505") {
              toast.info("이미 찜한 아티스트입니다");
              return;
            }
            throw error;
          }

          setFavoriteArtists((prev) => [data as UserFavoriteArtist, ...prev]);
          // 알림은 아직 없으므로 약속하지 않는다 — 목록에서 위로 올라온다는
          // 실제 효용만 알린다(570과 같은 문구 규칙).
          toast.success("찜한 아티스트의 공연을 먼저 보여드려요");
        }
      } catch (error: unknown) {
        logError(error, "toggleFavoriteArtist");
        toast.error(getErrorMessage(error));
      }
    },
    [userId, favoriteArtistIds, supabase]
  );

  return { favoriteArtists, isLoading, isFavoritedArtist, toggleFavoriteArtist };
}
