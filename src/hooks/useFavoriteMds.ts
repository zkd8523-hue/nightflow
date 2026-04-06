"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { getErrorMessage, logError } from "@/lib/utils/error";
import type { UserFavoriteMd } from "@/types/database";

export function useFavoriteMds(userId: string | undefined) {
  const [favoriteMds, setFavoriteMds] = useState<UserFavoriteMd[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!userId) {
      setFavoriteMds([]);
      setIsLoading(false);
      return;
    }

    const fetchFavoriteMds = async () => {
      const { data } = await supabase
        .from("user_favorite_mds")
        .select("*, md:users!user_favorite_mds_md_id_fkey(id, name, profile_image, md_unique_slug)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      setFavoriteMds((data as UserFavoriteMd[]) || []);
      setIsLoading(false);
    };

    fetchFavoriteMds();
  }, [userId, supabase]);

  const favoriteMdIds = useMemo(
    () => new Set(favoriteMds.map((f) => f.md_id)),
    [favoriteMds]
  );

  const isFavoritedMd = useCallback(
    (mdId: string) => favoriteMdIds.has(mdId),
    [favoriteMdIds]
  );

  const toggleFavoriteMd = useCallback(
    async (mdId: string) => {
      if (!userId) {
        toast.error("로그인이 필요합니다");
        return;
      }

      const currentlyFavorited = favoriteMdIds.has(mdId);

      try {
        if (currentlyFavorited) {
          await supabase
            .from("user_favorite_mds")
            .delete()
            .eq("user_id", userId)
            .eq("md_id", mdId);

          setFavoriteMds((prev) => prev.filter((f) => f.md_id !== mdId));
          toast.success("MD 찜이 해제되었습니다");
        } else {
          const { data, error } = await supabase
            .from("user_favorite_mds")
            .insert({ user_id: userId, md_id: mdId })
            .select("*, md:users!user_favorite_mds_md_id_fkey(id, name, profile_image, md_unique_slug)")
            .single();

          if (error) {
            if (error.code === "23505") {
              toast.info("이미 찜한 MD입니다");
              return;
            }
            throw error;
          }

          setFavoriteMds((prev) => [data as UserFavoriteMd, ...prev]);
          toast.success("MD를 찜했습니다");
        }
      } catch (error: unknown) {
        logError(error, "toggleFavoriteMd");
        toast.error(getErrorMessage(error));
      }
    },
    [userId, favoriteMdIds, supabase]
  );

  return { favoriteMds, isLoading, isFavoritedMd, toggleFavoriteMd };
}
