"use client";

import { useRef, useEffect } from "react";
import { toast } from "sonner";
import { Timer } from "lucide-react";
import type { Auction } from "@/types/database";

interface ExtensionNoticeProps {
  auction: Auction;
  remaining: number; // seconds
}

export function ExtensionNotice({ auction, remaining }: ExtensionNoticeProps) {
  const extensionCount = auction.extension_count ?? 0;
  const maxExtensions = auction.max_extensions ?? 3;
  const autoExtendMin = auction.auto_extend_min ?? 3;

  const prevCountRef = useRef(extensionCount);

  const extensionWindow = autoExtendMin * 60;
  const extensionsLeft = maxExtensions - extensionCount;
  const isNearEnd = remaining > 0 && remaining <= extensionWindow;

  // 연장 발생 감지 → toast 알림
  useEffect(() => {
    if (extensionCount > prevCountRef.current) {
      const left = maxExtensions - extensionCount;
      toast.info(
        `경매가 ${autoExtendMin}분 연장되었습니다${left > 0 ? ` (${left}회 남음)` : ""}`,
        { duration: 4000 }
      );
    }
    prevCountRef.current = extensionCount;
  }, [extensionCount, autoExtendMin, maxExtensions]);

  if (!isNearEnd) return null;

  if (extensionsLeft <= 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-neutral-900/50 border border-neutral-800/50 mt-2">
        <Timer className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        <p className="text-[11px] font-bold text-neutral-300">
          마지막 기회! 더 이상 연장되지 않습니다
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-neutral-900/50 border border-neutral-800/50 mt-2">
      <Timer className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
      <p className="text-[11px] font-bold text-neutral-400">
        지금 입찰하면 {autoExtendMin}분 더 연장돼요! ({extensionsLeft}회 남음)
      </p>
    </div>
  );
}
