"use client";

import { Heart } from "lucide-react";
import { useDjFavoritesContext } from "@/components/providers";

interface DjFavoriteButtonProps {
  djId: string;
  djName?: string;
  /** 목록 행은 기본(sm), 프로필 시트처럼 주요 액션인 자리는 lg */
  size?: "sm" | "lg";
}

/**
 * DJ 하트. MdFavoriteButton(083)과 같은 패턴이되, 라인업 목록의 행 안에 들어가므로
 * 원형 배경 없이 아이콘만 두어 행 높이를 키우지 않는다.
 *
 * 클릭이 부모 행의 링크로 새지 않도록 preventDefault + stopPropagation 필수.
 */
export function DjFavoriteButton({ djId, djName, size = "sm" }: DjFavoriteButtonProps) {
  const { isFavoritedDj, toggleFavoriteDj } = useDjFavoritesContext();

  const favorited = isFavoritedDj(djId);
  const label = djName
    ? `${djName} ${favorited ? "찜 해제" : "찜하기"}`
    : favorited
      ? "DJ 찜 해제"
      : "DJ 찜하기";

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavoriteDj(djId);
      }}
      aria-label={label}
      title={label}
      className={`shrink-0 inline-flex items-center justify-center rounded-full hover:bg-white/5 transition-colors ${
        size === "lg" ? "w-11 h-11" : "w-7 h-7 -mr-1"
      }`}
    >
      <Heart
        className={`transition-colors ${size === "lg" ? "w-6 h-6" : "w-4 h-4"} ${
          favorited ? "text-red-500 fill-red-500" : "text-muted-foreground"
        }`}
      />
    </button>
  );
}
