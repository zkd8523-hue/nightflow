"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { getErrorMessage, logError } from "@/lib/utils/error";
import type { UserFavoriteDj } from "@/types/database";

/**
 * DJ 찜. useFavoriteClubs(070) / useFavoriteMds(083)와 같은 패턴의 3번째 인스턴스.
 *
 * 이 찜은 "하트한 DJ만 보기"(필터)가 아니라 /lineups 화면에서 날짜 그룹 안의
 * 정렬 우선순위로 쓴다 — 하트 안 한 DJ도 계속 목록에 남는다.
 */
export function useFavoriteDjs(userId: string | undefined) {
  const [favoriteDjs, setFavoriteDjs] = useState<UserFavoriteDj[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!userId) {
      setFavoriteDjs([]);
      setIsLoading(false);
      return;
    }

    const fetchFavoriteDjs = async () => {
      const { data } = await supabase
        .from("user_favorite_djs")
        .select("*, dj:djs(id, display_name, slug, instagram, photo_url)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      setFavoriteDjs((data as UserFavoriteDj[]) || []);
      setIsLoading(false);
    };

    fetchFavoriteDjs();
  }, [userId, supabase]);

  const favoriteDjIds = useMemo(
    () => new Set(favoriteDjs.map((f) => f.dj_id)),
    [favoriteDjs]
  );

  const isFavoritedDj = useCallback(
    (djId: string) => favoriteDjIds.has(djId),
    [favoriteDjIds]
  );

  const toggleFavoriteDj = useCallback(
    async (djId: string) => {
      if (!userId) {
        toast.error("로그인이 필요합니다");
        return;
      }

      const currentlyFavorited = favoriteDjIds.has(djId);

      try {
        if (currentlyFavorited) {
          await supabase
            .from("user_favorite_djs")
            .delete()
            .eq("user_id", userId)
            .eq("dj_id", djId);

          setFavoriteDjs((prev) => prev.filter((f) => f.dj_id !== djId));
          toast.success("DJ 찜이 해제되었습니다");
        } else {
          const { data, error } = await supabase
            .from("user_favorite_djs")
            .insert({ user_id: userId, dj_id: djId })
            .select("*, dj:djs(id, display_name, slug, instagram, photo_url)")
            .single();

          if (error) {
            if (error.code === "23505") {
              toast.info("이미 찜한 DJ입니다");
              return;
            }
            throw error;
          }

          setFavoriteDjs((prev) => [data as UserFavoriteDj, ...prev]);
          // 알림 기능은 아직 없으므로 약속하지 않는다 — 라인업에서 위로 올라온다는
          // 실제 효용만 알린다 (Migration 551이 남긴 교훈: 찜해도 아무 일이 안 일어나면
          // 유저는 "왜 찜하는지" 알 수 없다).
          toast.success("찜한 DJ는 라인업에서 먼저 보여드려요");
        }
      } catch (error: unknown) {
        logError(error, "toggleFavoriteDj");
        toast.error(getErrorMessage(error));
      }
    },
    [userId, favoriteDjIds, supabase]
  );

  return { favoriteDjs, isLoading, isFavoritedDj, toggleFavoriteDj };
}
