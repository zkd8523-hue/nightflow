import type { HotdealBenefitsByDow, HotdealDow, HotdealTimeSlot } from "@/types/database";

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
  return raw.filter(
    (s): s is HotdealTimeSlot =>
      !!s && typeof s === "object" && typeof s.text === "string" && s.text.trim().length > 0
  );
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
