"use client";

import { Heart } from "lucide-react";
import { useFavoritesContext } from "@/components/providers";

interface FavoriteButtonProps {
  clubId: string;
  /** "default": 작은 inline (28px). "overlay": 큰 hero overlay (36px) */
  variant?: "default" | "overlay";
}

export function FavoriteButton({ clubId, variant = "default" }: FavoriteButtonProps) {
  const { isFavorited, toggleFavorite } = useFavoritesContext();

  const favorited = isFavorited(clubId);

  if (variant === "overlay") {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(clubId);
        }}
        className="w-12 h-12 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 active:bg-black/80 transition-colors"
        title={favorited ? "찜 해제" : "클럽 찜하기"}
      >
        <Heart
          className={`w-7 h-7 transition-colors ${
            favorited ? "text-red-500 fill-red-500" : "text-foreground"
          }`}
        />
      </button>
    );
  }

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
      <span className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-muted/80 border border-border/50 hover:border-border active:bg-muted/80 transition-colors">
        <Heart
          className={`w-3.5 h-3.5 transition-colors ${
            favorited
              ? "text-red-500 fill-red-500"
              : "text-muted-foreground"
          }`}
        />
      </span>
    </button>
  );
}
