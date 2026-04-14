"use client";

import { Heart } from "lucide-react";
import { useFavoritesContext } from "@/components/providers";

interface FavoriteButtonProps {
  clubId: string;
}

export function FavoriteButton({ clubId }: FavoriteButtonProps) {
  const { isFavorited, toggleFavorite } = useFavoritesContext();

  const favorited = isFavorited(clubId);

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(clubId);
      }}
      className="shrink-0 min-w-[44px] min-h-[44px] inline-flex items-center justify-center -m-2"
      title={favorited ? "찜 해제" : "클럽 찜하기"}
    >
      <span className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-neutral-800/80 border border-neutral-700/50 hover:border-neutral-500 active:bg-neutral-700/80 transition-colors">
        <Heart
          className={`w-3.5 h-3.5 transition-colors ${
            favorited
              ? "text-red-500 fill-red-500"
              : "text-neutral-400"
          }`}
        />
      </span>
    </button>
  );
}
