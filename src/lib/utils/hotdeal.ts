import type { HotdealBenefitsByDow, HotdealDow, HotdealTimeSlot, HotdealTableZone } from "@/types/database";

export const TABLE_ZONE_OPTIONS: { value: HotdealTableZone; label: string }[] = [
  { value: "bar", label: "BAR" },
  { value: "bar_aisle", label: "BAR통로" },
  { value: "sub_main", label: "준메인" },
  { value: "main", label: "메인" },
  { value: "prime", label: "초메인" },
];

export function tableZoneLabel(zone: HotdealTableZone | null | undefined): string | null {
  if (!zone) return null;
  return TABLE_ZONE_OPTIONS.find((o) => o.value === zone)?.label ?? null;
}

// 게스트 간판 혜택 태그
export const GUEST_SIGN_BENEFIT_PRESETS: { value: string; label: string; emoji: string }[] = [
  { value: "free_entry", label: "무료입장", emoji: "🎟" },
  { value: "free_drink", label: "프리드링크", emoji: "🍸" },
];

export function benefitLabel(tag: string): { label: string; emoji: string } {
  const preset = GUEST_SIGN_BENEFIT_PRESETS.find((p) => p.value === tag);
  if (preset) return { label: preset.label, emoji: preset.emoji };
  // 직접입력: tag 자체가 라벨
  return { label: tag, emoji: "✨" };
}

/**
 * 레거시 string 또는 신규 배열을 항상 HotdealTimeSlot[]로 정규화.
 * 미입력/빈 값은 빈 배열 반환.
 */
export function normalizeDowSlots(
  raw: HotdealBenefitsByDow[HotdealDow] | undefined | null
): HotdealTimeSlot[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? [{ until: null, text: trimmed }] : [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (s): s is HotdealTimeSlot =>
        !!s && typeof s === "object" && typeof s.text === "string" && s.text.trim().length > 0
    )
    .map((s) => ({
      until: s.until,
      text: s.text,
      benefits: Array.isArray(s.benefits) ? s.benefits.filter((b) => typeof b === "string") : [],
    }));
}

/**
 * 단일 줄 요약 (소비측에서 한 줄 노출이 필요할 때).
 * 예: "~01:00 프리패스 / 이후 테이블 50%"
 */
export function summarizeSlots(slots: HotdealTimeSlot[]): string {
  if (slots.length === 0) return "";
  if (slots.length === 1) return slots[0].text;
  return slots
    .map((s) => (s.until ? `~${s.until} ${s.text}` : `이후 ${s.text}`))
    .join(" / ");
}
