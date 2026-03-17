"use client";

import { memo } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import { formatCountdown } from "@/lib/utils/format";
import { URGENCY_STYLES, URGENCY_LABELS } from "@/lib/constants/timer-urgency";
import { cn } from "@/lib/utils";

interface AuctionTimerProps {
  endTime: string;
  status: "active" | "ended" | "scheduled";
  startTimeLabel?: string;
}

export const AuctionTimer = memo(function AuctionTimer({ endTime, status, startTimeLabel }: AuctionTimerProps) {
  const { remaining, level, shouldFlash } = useCountdown(status !== "ended" ? endTime : null);

  // 경매 예정 (카운트다운 끝남 또는 시작 시간 이미 지남)
  if (status === "scheduled" && remaining === 0) {
    return (
      <div className="text-center py-4 rounded-xl bg-neutral-900/50 border border-neutral-800/50">
        <span className="text-[13px] text-neutral-500 font-bold">경매 예정</span>
        {startTimeLabel && (
          <p className="text-[15px] text-white font-bold mt-1">{startTimeLabel}</p>
        )}
      </div>
    );
  }

  // 경매 종료 / 마감 처리중
  if (remaining === 0) {
    return (
      <div className="text-center py-2 bg-neutral-800 rounded-md">
        <span className="text-sm font-medium text-neutral-400">
          {status === "active" ? "마감 처리중" : "경매 종료"}
        </span>
      </div>
    );
  }

  const styles = URGENCY_STYLES[level];
  const label = status === "scheduled" ? "시작까지" : URGENCY_LABELS[level];

  return (
    <div
      className={cn(
        "text-center py-4 rounded-xl transition-all duration-500",
        styles.bg,
        `border ${styles.border}`,
        styles.glow,
        level === 'critical' && 'animate-breathe'
      )}
    >
      <div className="flex items-center justify-center gap-3">
        <span className={cn("text-[13px] font-bold transition-colors", styles.text)}>
          {label}
        </span>
        <span
          className={cn(
            "text-[22px] font-mono font-black tracking-tight tabular-nums transition-all duration-300",
            styles.text,
            shouldFlash && "animate-flip"
          )}
        >
          {formatCountdown(remaining)}
        </span>
      </div>
      {status === "scheduled" && startTimeLabel && (
        <p className="text-[11px] text-neutral-500 mt-1">{startTimeLabel}</p>
      )}
    </div>
  );
});
