"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { PuzzleInterest } from "@/types/database";

export function useFavoritePuzzles(userId: string | undefined) {
  const [favorites, setFavorites] = useState<PuzzleInterest[]>([]);
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
        .from("puzzle_interests")
        .select("*, puzzle:puzzles(*, leader:users!puzzles_leader_id_fkey(id, name, display_name, profile_image, deal_count_total, created_at, gender))")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      setFavorites((data as PuzzleInterest[]) || []);
      setIsLoading(false);
    };

    fetchFavorites();
  }, [userId, supabase]);

  const favoritePuzzleIds = useMemo(
    () => new Set(favorites.map((f) => f.puzzle_id)),
    [favorites]
  );

  const isFavoritedPuzzle = useCallback(
    (puzzleId: string) => favoritePuzzleIds.has(puzzleId),
    [favoritePuzzleIds]
  );

  const toggleFavoritePuzzle = useCallback(
    async (puzzleId: string) => {
      if (!userId) {
        toast.error("로그인이 필요합니다");
        return;
      }

      const currentlyFavorited = favoritePuzzleIds.has(puzzleId);

      try {
        if (currentlyFavorited) {
          await supabase
            .from("puzzle_interests")
            .delete()
            .eq("user_id", userId)
            .eq("puzzle_id", puzzleId);

          setFavorites((prev) => prev.filter((f) => f.puzzle_id !== puzzleId));
        } else {
          const { data, error } = await supabase
            .from("puzzle_interests")
            .insert({ user_id: userId, puzzle_id: puzzleId })
            .select("*, puzzle:puzzles(*, leader:users!puzzles_leader_id_fkey(id, name, display_name, profile_image, deal_count_total, created_at, gender))")
            .single();

          if (error) {
            if (error.code === "23505") return;
            throw error;
          }

          setFavorites((prev) => [data as PuzzleInterest, ...prev]);
        }
      } catch {
        toast.error("찜 처리에 실패했습니다");
      }
    },
    [userId, favoritePuzzleIds, supabase]
  );

  return { favoritePuzzles: favorites, isLoading, isFavoritedPuzzle, toggleFavoritePuzzle };
}
