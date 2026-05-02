"use client";

import { memo } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import { formatCountdown } from "@/lib/utils/format";
import { URGENCY_STYLES_COMPACT, URGENCY_FONT_SIZES } from "@/lib/constants/timer-urgency";
import { Clock, AlertTriangle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineTimerProps {
    endTime: string;
    status: "active" | "ended" | "scheduled";
}

export const InlineTimer = memo(function InlineTimer({ endTime, status }: InlineTimerProps) {
    const { remaining, level, shouldFlash } = useCountdown(status === "active" ? endTime : null);

    if (status !== "active") {
        return null;
    }

    const styles = URGENCY_STYLES_COMPACT[level];
    const fontSize = URGENCY_FONT_SIZES[level];
    const iconClassName = cn("w-5 h-5 transition-all", styles.text);

    return (
        <div
            className={cn(
                "relative flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-300",
                styles.bg,
                `border ${styles.border}`,
                styles.glow
            )}
        >
            {(level === 'idle' || level === 'normal') && <Clock className={iconClassName} />}
            {level === 'warning' && <AlertTriangle className={iconClassName} />}
            {level === 'critical' && <Zap className={iconClassName} />}
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
