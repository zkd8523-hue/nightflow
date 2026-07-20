"use client";

import { useEffect, useRef } from "react";
import { CHAT_REACTION_EMOJIS, type ChatReactionEmoji } from "@/types/database";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: ChatReactionEmoji) => void;
  /** 내가 누른 이모지 (선택된 모양으로 강조) */
  selected?: Set<ChatReactionEmoji>;
  /** 메시지 카드 기준 위치 (anchor element) */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

/**
 * 이모지 반응 패널 (페메·디스코드 스타일)
 * - 6개 이모지 가로 배치
 * - anchor 위에 floating (absolute)
 * - 외부 클릭 시 닫힘
 */
export function ReactionPanel({
  open,
  onClose,
  onPick,
  selected,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 닫힘
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    // 다음 tick에 등록 (open 트리거 클릭이 바로 close 시키는 것 방지)
    const t = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute z-30 -translate-y-full -translate-x-1/2 left-1/2 -top-1 flex items-center gap-0.5 px-2 py-1.5 rounded-full bg-muted border border-border shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {CHAT_REACTION_EMOJIS.map((emoji) => {
        const isSelected = selected?.has(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onPick(emoji);
              onClose();
            }}
            className={`w-9 h-9 flex items-center justify-center rounded-full text-[18px] transition-transform active:scale-90 hover:scale-110 ${
              isSelected ? "bg-amber-500/30 ring-1 ring-amber-400" : ""
            }`}
            aria-label={`${emoji} 반응`}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
