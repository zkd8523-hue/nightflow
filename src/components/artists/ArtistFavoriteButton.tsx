"use client";

import { Heart } from "lucide-react";
import { useArtistFavoritesContext } from "@/components/providers";

/**
 * 아티스트 찜 하트. /artists/[slug]는 서버 컴포넌트라 이 버튼만 클라이언트 섬으로 뺀다.
 *
 * 찜하면 /events 목록에서 그 아티스트가 나오는 공연이 날짜 그룹 최상단으로 올라오고,
 * 출연진 이름 옆에 하트가 붙는다(필터가 아니라 정렬 — 나머지 공연도 그대로 보인다).
 */
export function ArtistFavoriteButton({
  artistId,
  artistName,
}: {
  artistId: string;
  artistName: string;
}) {
  const { isFavoritedArtist, toggleFavoriteArtist } = useArtistFavoritesContext();
  const favorited = isFavoritedArtist(artistId);

  return (
    <button
      onClick={() => toggleFavoriteArtist(artistId)}
      aria-pressed={favorited}
      aria-label={favorited ? `${artistName} 찜 해제` : `${artistName} 찜하기`}
      className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-bold transition-colors active:scale-95 ${
        favorited
          ? "bg-red-500/15 text-red-400"
          : "bg-[#1C1C1E] text-muted-foreground hover:text-foreground"
      }`}
    >
      <Heart className={`w-4 h-4 ${favorited ? "fill-red-500 text-red-500" : ""}`} />
      {favorited ? "찜함" : "찜하기"}
    </button>
  );
}
