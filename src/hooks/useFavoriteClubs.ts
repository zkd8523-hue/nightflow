"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { getErrorMessage, logError } from "@/lib/utils/error";
import type { UserFavoriteClub } from "@/types/database";

export function useFavoriteClubs(userId: string | undefined) {
  const [favorites, setFavorites] = useState<UserFavoriteClub[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!userId) {
      setFavorites([]);
      setIsLoading(false);
      return;
    }

    const fetchFavorites = async () => {
      const { data } = await supabase
        .from("user_favorite_clubs")
        .select("*, club:clubs(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      setFavorites((data as UserFavoriteClub[]) || []);
      setIsLoading(false);
    };

    fetchFavorites();
  }, [userId, supabase]);

  const favoriteClubIds = useMemo(
    () => new Set(favorites.map((f) => f.club_id)),
    [favorites]
  );

  const isFavorited = useCallback(
    (clubId: string) => favoriteClubIds.has(clubId),
    [favoriteClubIds]
  );

  const toggleFavorite = useCallback(
    async (clubId: string) => {
      if (!userId) {
        toast.error("로그인이 필요합니다");
        return;
      }

      const currentlyFavorited = favoriteClubIds.has(clubId);

      try {
        if (currentlyFavorited) {
          await supabase
            .from("user_favorite_clubs")
            .delete()
            .eq("user_id", userId)
            .eq("club_id", clubId);

          setFavorites((prev) => prev.filter((f) => f.club_id !== clubId));
          toast.success("찜이 해제되었습니다");
        } else {
          const { data, error } = await supabase
            .from("user_favorite_clubs")
            .insert({ user_id: userId, club_id: clubId })
            .select("*, club:clubs(*)")
            .single();

          if (error) {
            if (error.code === "23505") {
              toast.info("이미 찜한 클럽입니다");
              return;
            }
            throw error;
          }

          setFavorites((prev) => [data as UserFavoriteClub, ...prev]);
          toast.success("클럽을 찜했습니다");
        }
      } catch (error: unknown) {
        logError(error, "toggleFavorite");
        toast.error(getErrorMessage(error));
      }
    },
    [userId, favoriteClubIds, supabase]
  );

  return { favorites, isLoading, isFavorited, toggleFavorite };
}
