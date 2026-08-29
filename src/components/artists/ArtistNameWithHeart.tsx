"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useArtistFavoritesContext } from "@/components/providers";

/**
 * 출연진 이름 + 찜 하트. 공연 상세(서버 컴포넌트)의 라인업 줄에서 쓴다.
 *
 * 찜 여부는 로그인 유저마다 다르므로 서버에서 렌더할 수 없다 — 이름만 클라이언트
 * 섬으로 뺀다(/events 목록의 하트와 같은 표기 규칙).
 */
export function ArtistNameWithHeart({
  artistId,
  name,
  slug,
}: {
  artistId: string | null;
  name: string;
  slug: string | null;
}) {
  const { isFavoritedArtist } = useArtistFavoritesContext();
  const fav = artistId ? isFavoritedArtist(artistId) : false;

  const body = (
    <>
      {fav && (
        <Heart
          className="inline w-3.5 h-3.5 mr-1 -mt-0.5 fill-red-500 text-red-500"
          aria-label="찜한 아티스트"
        />
      )}
      {name}
    </>
  );

  if (!slug) return <span className="text-[15px] font-bold min-w-0 truncate">{body}</span>;

  return (
    <Link
      href={`/artists/${slug}`}
      className="text-[15px] font-bold min-w-0 truncate hover:text-brand-amber transition-colors"
    >
      {body}
    </Link>
  );
}
