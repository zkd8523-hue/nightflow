import type { MDHealthScore, MDHealthStatus } from "@/types/database";

export function computeHealthStatus(score: MDHealthScore): MDHealthStatus {
  if (score.flag_consecutive_noshow || score.flag_dormant) return "critical";

  if (score.health_score === null) return "good";
  if (
    score.health_score >= 90 &&
    score.noshow_count === 0 &&
    score.recent_auctions_14d > 0
  ) {
    return "excellent";
  }
  if (score.health_score >= 70) return "good";
  if (score.health_score >= 50) return "attention";
  return "critical";
}

export function getHealthBadgeConfig(status: MDHealthStatus) {
  switch (status) {
    case "excellent":
      return { type: "dot" as const, color: "bg-green-500" };
    case "good":
      return null;
    case "attention":
      return {
        type: "badge" as const,
        bg: "bg-amber-500/10",
        text: "text-amber-500",
        label: "주의",
      };
    case "critical":
      return {
        type: "badge" as const,
        bg: "bg-red-500/10",
        text: "text-red-500",
        label: "위험",
      };
  }
}

export function getGradeLabel(grade: string): string {
  switch (grade) {
    case "S":
      return "S등급";
    case "A":
      return "A등급";
    case "B":
      return "B등급";
    case "C":
      return "C등급";
    case "F":
      return "F등급";
    default:
      return "평가 중";
  }
}
