"use client";

import { Heart } from "lucide-react";
import { useMdFavoritesContext } from "@/components/providers";

interface MdFavoriteButtonProps {
  mdId: string;
}

export function MdFavoriteButton({ mdId }: MdFavoriteButtonProps) {
  const { isFavoritedMd, toggleFavoriteMd } = useMdFavoritesContext();

  const favorited = isFavoritedMd(mdId);

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavoriteMd(mdId);
      }}
      className="shrink-0 inline-flex items-center justify-center gap-2 px-4 h-[44px] rounded-xl bg-neutral-800/80 border border-neutral-700/50 hover:border-neutral-500 active:bg-neutral-700/80 transition-colors text-[13px] font-bold"
      title={favorited ? "MD 찜 해제" : "MD 찜하기"}
    >
      <Heart
        className={`w-4 h-4 transition-colors ${
          favorited ? "text-red-500 fill-red-500" : "text-neutral-400"
        }`}
      />
      <span className={favorited ? "text-red-400" : "text-neutral-400"}>
        {favorited ? "찜함" : "찜하기"}
      </span>
    </button>
  );
}
