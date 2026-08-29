"use client";

import { Heart } from "lucide-react";
import { useArtistFavoritesContext } from "@/components/providers";

/**
 * 카드 안 출연진 한 줄 — 찜한 아티스트에만 하트를 붙인다.
 *
 * 링크는 걸지 않는다: 11.5px 이름이 쉼표로 이어 붙어 있어 카드를 누르려다
 * 옆 사람 프로필로 새는 오클릭이 났다(실측 피드백). 카드는 공연 상세 하나로만
 * 가고, 개별 아티스트는 거기서 제대로 된 터치 타겟으로 고른다.
 *
 * 찜 여부는 유저마다 달라 서버에서 못 그린다 — 이 줄만 클라이언트 섬으로 뺀다.
 */
export function PerformerNames({
  performers,
  prefix,
}: {
  performers: { id?: string | null; name: string }[];
  /** "with " 같은 접두사. 공연장 페이지는 없이 쓴다. */
  prefix?: string;
}) {
  const { isFavoritedArtist } = useArtistFavoritesContext();
  if (performers.length === 0) return null;

  return (
    <p className="text-[11.5px] text-neutral-400 mt-0.5 line-clamp-2">
      {prefix}
      {performers.map((p, i) => {
        const fav = p.id ? isFavoritedArtist(p.id) : false;
        return (
          <span key={`${p.id ?? p.name}-${i}`}>
            {i > 0 && ", "}
            {fav && (
              <Heart
                className="inline w-3 h-3 mr-0.5 -mt-0.5 fill-red-500 text-red-500"
                aria-label="찜한 아티스트"
              />
            )}
            <span className={fav ? "text-neutral-200 font-bold" : undefined}>{p.name}</span>
          </span>
        );
      })}
    </p>
  );
}
