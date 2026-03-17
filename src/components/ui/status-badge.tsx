import { memo } from "react";
import type { ClubStatus } from "@/types/database";

interface StatusBadgeProps {
  status: ClubStatus;
  size?: "sm" | "md";
}

export const StatusBadge = memo(function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = {
    pending: {
      label: "승인대기",
      bg: "bg-amber-500/20",
      text: "text-amber-400",
      icon: "⏳",
    },
    approved: {
      label: "승인완료",
      bg: "bg-green-500/20",
      text: "text-green-400",
      icon: "✓",
    },
    rejected: {
      label: "거부됨",
      bg: "bg-red-500/20",
      text: "text-red-400",
      icon: "✕",
    },
  }[status];

  const sizeClass =
    size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1";

  return (
    <span
      className={`${sizeClass} font-bold rounded-full ${config.bg} ${config.text}`}
    >
      {config.icon} {config.label}
    </span>
  );
});
