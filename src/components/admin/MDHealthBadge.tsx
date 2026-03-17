import type { MDHealthStatus } from "@/types/database";
import { getHealthBadgeConfig } from "@/lib/utils/mdHealth";

interface Props {
  status: MDHealthStatus;
  size?: "sm" | "md";
}

export function MDHealthBadge({ status, size = "sm" }: Props) {
  const config = getHealthBadgeConfig(status);
  if (!config) return null;

  if (config.type === "dot") {
    return <div className={`w-2 h-2 rounded-full ${config.color}`} />;
  }

  return (
    <div
      className={`
      px-2 py-1 rounded-full text-xs font-bold
      ${config.bg} ${config.text}
      ${size === "md" ? "px-3 py-1.5 text-sm" : ""}
    `}
    >
      {config.label}
    </div>
  );
}
