"use client";

import { Share2 } from "lucide-react";
import { shareClub } from "@/lib/utils/share";

interface ClubShareButtonProps {
  clubId: string;
  clubName: string;
  area?: string | null;
}

/** FavoriteButton(variant="overlay")과 같은 자리에 짝을 맞추는 이미지 오버레이 버튼. */
export function ClubShareButton({ clubId, clubName, area }: ClubShareButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        shareClub({ clubId, clubName, area });
      }}
      aria-label="클럽 공유하기"
      className="w-12 h-12 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 active:bg-black/80 transition-colors"
    >
      <Share2 className="w-6 h-6 text-foreground" />
    </button>
  );
}
