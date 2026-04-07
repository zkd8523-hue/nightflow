"use client";

import { useState } from "react";
import Image from "next/image";
import { getLiquorCategory } from "@/lib/utils/format";
import { getDrinkCategoryImage } from "@/lib/constants/drink-images";

interface DrinkPlaceholderProps {
    includes: string[];
    className?: string;
}

const DRINK_GRADIENTS: Record<string, { gradient: string; emoji: string }> = {
    champagne: { gradient: "from-yellow-900/80 via-yellow-800/60 to-amber-900/80", emoji: "🍾" },
    vodka: { gradient: "from-sky-900/80 via-blue-800/60 to-indigo-900/80", emoji: "🧊" },
    whisky: { gradient: "from-amber-900/80 via-orange-800/60 to-amber-950/80", emoji: "🥃" },
    tequila: { gradient: "from-lime-900/80 via-green-800/60 to-emerald-900/80", emoji: "🌵" },
    wine: { gradient: "from-rose-900/80 via-red-800/60 to-rose-950/80", emoji: "🍷" },
    rum: { gradient: "from-orange-900/80 via-amber-800/60 to-orange-950/80", emoji: "🏴‍☠️" },
    gin: { gradient: "from-teal-900/80 via-cyan-800/60 to-teal-950/80", emoji: "🌿" },
    etc: { gradient: "from-purple-900/80 via-violet-800/60 to-purple-950/80", emoji: "🍸" },
    extra: { gradient: "from-neutral-900/80 via-neutral-800/60 to-neutral-950/80", emoji: "🥂" },
};

/**
 * 주류 종류에 기반한 기본 이미지 플레이스홀더
 * auction.thumbnail_url, club.thumbnail_url 모두 없을 때 사용
 */
export function DrinkPlaceholder({ includes, className = "" }: DrinkPlaceholderProps) {
    // includes에서 주류 카테고리 판별
    const primaryCategory = getPrimaryDrinkCategory(includes);
    const { gradient, emoji } = DRINK_GRADIENTS[primaryCategory] || DRINK_GRADIENTS.extra;

    return (
        <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center ${className}`}>
            <span className="text-2xl opacity-80 drop-shadow-lg">{emoji}</span>
        </div>
    );
}

/**
 * 주류 목록에서 가장 대표적인 카테고리 판별
 */
function getPrimaryDrinkCategory(includes: string[]): string {
    if (!includes || includes.length === 0) return "extra";

    // 주류 카테고리 우선순위: champagne > whisky > vodka > tequila > wine > rum > gin > etc
    const priority = ["champagne", "whisky", "vodka", "tequila", "wine", "rum", "gin", "etc"];

    for (const item of includes) {
        const cat = getLiquorCategory(item);
        if (cat !== "extra") return cat;
    }

    return "extra";
}

/**
 * 경매의 대표 이미지 URL을 결정하는 유틸리티
 * Fallback 체인: auction.thumbnail_url > club.thumbnail_url > 주류 카테고리 기본 이미지 > null (DrinkPlaceholder 사용)
 */
export function getAuctionImageUrl(
    auctionThumbnail: string | null | undefined,
    clubThumbnail: string | null | undefined,
    includes?: string[]
): string | null {
    if (auctionThumbnail) return auctionThumbnail;

    if (clubThumbnail) return clubThumbnail;

    const drinkImage = includes ? getDrinkCategoryImage(includes) : null;
    if (drinkImage) return drinkImage;

    return null;
}

interface AuctionImageProps {
    auctionThumbnail: string | null | undefined;
    clubThumbnail: string | null | undefined;
    includes: string[] | null | undefined;
    alt: string;
    sizes?: string;
    priority?: boolean;
    placeholderClassName?: string;
}

/**
 * 경매 이미지 렌더링 + onError 자동 fallback
 * URL 로드 실패 시 DrinkPlaceholder(그라디언트+이모지)로 자동 전환
 */
export function AuctionImage({
    auctionThumbnail,
    clubThumbnail,
    includes,
    alt,
    sizes,
    priority,
    placeholderClassName,
}: AuctionImageProps) {
    const url = getAuctionImageUrl(auctionThumbnail, clubThumbnail, includes || undefined);
    const [errored, setErrored] = useState(false);

    if (!url || errored) {
        return <DrinkPlaceholder includes={includes || []} className={placeholderClassName} />;
    }

    return (
        <Image
            src={url}
            alt={alt}
            fill
            className="object-cover"
            sizes={sizes}
            priority={priority}
            onError={() => setErrored(true)}
        />
    );
}
