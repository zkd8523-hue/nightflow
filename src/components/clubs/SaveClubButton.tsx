"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { type Lang, makeT } from "@/lib/i18n";
import { isSavedClub, toggleSavedClub, type SavedClub } from "@/lib/clubs/savedClubs";
import { trackForeignEvent } from "@/lib/analytics/events";

/**
 * 클럽 찜(하트) 토글 버튼.
 * 여러 클럽을 둘러보다 이름을 잊어버려 예약 폼에서 재검색해야 하던 이탈을 막기 위한 장치 —
 * 찜한 클럽은 컨시어지 폼 상단에 칩으로 떠서 원탭으로 담긴다.
 */
export function SaveClubButton({
  club,
  lang,
  className = "",
  variant = "chip",
}: {
  club: Omit<SavedClub, "savedAt">;
  lang: Lang;
  className?: string;
  /** chip: 인라인 작은 알약 / cta: 하단 예약 버튼 옆에 나란히 서는 큰 버튼 */
  variant?: "chip" | "cta";
}) {
  const t = makeT(lang);
  // localStorage는 첫 렌더에서 읽지 않음 (SSR HTML과 달라져 하이드레이션 불일치)
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isSavedClub(club.id));
  }, [club.id]);

  const label = saved
    ? t("찜 해제", "Saved", "保存済み", "已收藏")
    : t("찜하기", "Save", "保存", "收藏");

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={label}
      onClick={(e) => {
        // 카드/시트의 클릭 핸들러(상세 열기 등)와 겹치지 않도록
        e.preventDefault();
        e.stopPropagation();
        const next = toggleSavedClub(club);
        setSaved(next);
        if (next) {
          trackForeignEvent("foreign_club_saved", { club_id: club.id, club_name: club.name, area: club.area });
        }
      }}
      className={`flex items-center justify-center gap-1.5 border transition-colors ${
        variant === "cta"
          ? "py-3.5 rounded-xl text-[15px] font-black"
          : "shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold"
      } ${
        saved
          ? "bg-amber-500/15 border-amber-500/40 text-brand-amber"
          : "bg-muted border-border text-muted-foreground hover:text-foreground"
      } ${className}`}
    >
      <Heart className={`${variant === "cta" ? "w-4 h-4" : "w-3.5 h-3.5"} ${saved ? "fill-current" : ""}`} />
      {label}
    </button>
  );
}
