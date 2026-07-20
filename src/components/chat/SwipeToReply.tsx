"use client";

import { CornerDownRight } from "lucide-react";
import { useSwipeToReply } from "@/hooks/useSwipeToReply";

interface Props {
  isMine: boolean;
  onReply: () => void;
  /** 길게누름 등 다른 제스처 취소 */
  onMoveCancel?: () => void;
  children: React.ReactNode;
}

/**
 * 말풍선을 감싸 "밀어서 답글"을 붙이는 래퍼.
 * 훅을 직접 쓰기 어려운(맵 안에서 인라인 렌더되는) 화면용.
 */
export function SwipeToReply({ isMine, onReply, onMoveCancel, children }: Props) {
  const swipe = useSwipeToReply({ isMine, onReply, onMoveCancel });

  return (
    <div className="relative">
      {swipe.dragX !== 0 && (
        <span
          className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${
            isMine ? "-right-6" : "-left-6"
          }`}
          style={{ opacity: Math.min(1, Math.abs(swipe.dragX) / 48) }}
        >
          <CornerDownRight className="w-4 h-4 text-muted-foreground" />
        </span>
      )}
      <div {...swipe.handlers} style={swipe.style}>
        {children}
      </div>
    </div>
  );
}
