"use client";

import { memo } from "react";
import { useCountdown, type UrgencyLevel } from "@/hooks/useCountdown";
import { formatCountdown } from "@/lib/utils/format";
import { URGENCY_STYLES_COMPACT, URGENCY_FONT_SIZES } from "@/lib/constants/timer-urgency";
import { Clock, AlertTriangle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineTimerProps {
    endTime: string;
    status: "active" | "ended" | "scheduled";
}

/** 레벨별 아이콘 선택 */
function getIcon(level: UrgencyLevel) {
  if (level === 'normal') return Clock;
  if (level === 'warning') return AlertTriangle;
  return Zap; // critical
}

export const InlineTimer = memo(function InlineTimer({ endTime, status }: InlineTimerProps) {
    const { remaining, level, shouldFlash } = useCountdown(status === "active" ? endTime : null);

    if (status !== "active") {
        return null;
    }

    const styles = URGENCY_STYLES_COMPACT[level];
    const fontSize = URGENCY_FONT_SIZES[level];
    const Icon = getIcon(level);

    return (
        <div
            className={cn(
                "relative flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-300",
                styles.bg,
                `border ${styles.border}`,
                styles.glow
            )}
        >
            <Icon
                className={cn(
                    "w-5 h-5 transition-all",
                    styles.text
                )}
            />
            <span
                suppressHydrationWarning
                className={cn(
                    "font-mono font-bold tabular-nums transition-all duration-300",
                    styles.text,
                    fontSize,
                    shouldFlash && "animate-flip"
                )}
            >
                {formatCountdown(remaining)}
            </span>
        </div>
    );
});
