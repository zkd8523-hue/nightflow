"use client";

import { useCountdown } from "@/hooks/useCountdown";
import { Clock } from "lucide-react";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ContactTimer({ deadline }: { deadline: string | null }) {
  const { remaining, level } = useCountdown(deadline);

  if (!deadline || remaining <= 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-500/10 border border-red-500/20">
        <Clock className="w-4 h-4 text-red-500" />
        <span className="text-sm font-bold text-red-500">연락 시간 만료</span>
      </div>
    );
  }

  const colorMap = {
    normal: {
      bg: "bg-neutral-900",
      border: "border-neutral-700",
      text: "text-white",
      label: "text-neutral-400",
      icon: "text-neutral-400",
    },
    warning: {
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-400",
      label: "text-amber-400/70",
      icon: "text-amber-400",
    },
    critical: {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-400",
      label: "text-red-400/70",
      icon: "text-red-400",
    },
  };

  const c = colorMap[level];

  return (
    <div className="space-y-1">
      <div className={`flex items-center justify-between gap-3 py-2.5 px-4 rounded-xl ${c.bg} border ${c.border}`}>
        <div className="flex items-center gap-2 shrink-0">
          <Clock className={`w-4 h-4 ${c.icon}`} />
          <span className={`text-xs font-bold ${c.label} whitespace-nowrap`}>자동 취소까지</span>
        </div>
        <span className={`text-lg font-black tabular-nums tracking-wider ${c.text} ${level === "critical" ? "animate-pulse" : ""}`}>
          {formatTime(remaining)}
        </span>
      </div>
      <p className="text-[10px] text-neutral-500 text-center font-medium">
        MD에게 연락하면 타이머가 멈춥니다
      </p>
    </div>
  );
}
