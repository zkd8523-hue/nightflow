import type { HotdealBenefitsByDow, HotdealDow, HotdealTimeSlot, HotdealTableZone } from "@/types/database";

/**
 * 현재 노출해야 할 게스트 간판 주(week)의 시작일(월요일)을 ISO(YYYY-MM-DD)로 반환.
 *
 * ⚠️ 주차 롤오버 갭 보정:
 * - DB의 슬롯 차지(claim_hotdeal_slot)는 매주 월요일 18:00 KST에 오픈된다.
 * - 단순히 "이번 주 월요일"을 반환하면, 월요일 00:00~17:59 KST 구간에
 *   "아직 아무도 차지하지 못한 새 주 슬롯(0개)"만 보게 되어 게시판이 통째로 비어 보인다.
 * - 따라서 월요일 18:00 KST 이전이면 직전 주 월요일을 반환해, 18시 오픈 전까지는
 *   지난 주 슬롯을 계속 노출한다. (지난 주 슬롯의 expires_at도 같은 18:00로 맞물려 만료)
 *
 * 참조: supabase/migrations/236_hotdeal_week_unit.sql (18시 오픈 게이트 / expires_at)
 */
export function getActiveWeekStartISO(): string {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dowIdx = kstNow.getUTCDay(); // 0=일 ~ 6=토 (KST 기준)
  const daysFromMonday = dowIdx === 0 ? 6 : dowIdx - 1;
  const thisMonday = new Date(kstNow);
  thisMonday.setUTCDate(kstNow.getUTCDate() - daysFromMonday);
  thisMonday.setUTCHours(0, 0, 0, 0);

  // 월요일 18:00 KST(=09:00 UTC) 이전이면 직전 주로 보정
  const isMonday = dowIdx === 1;
  const beforeOpen = isMonday && kstNow.getUTCHours() < 18;
  if (beforeOpen) {
    thisMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  }
  return thisMonday.toISOString().slice(0, 10);
}

/** 영업일 요일 경계: 새벽 6시 KST 이전은 전날로 간주 (date.ts getClubEventDate와 동일 기준) */
export const BUSINESS_DAY_CUTOFF_HOUR = 6;

/**
 * 주어진 날짜(KST)가 속한 주의 월요일(YYYY-MM-DD)을 반환.
 *
 * 조각 슬롯 게이트에서 "조각 방문일이 속한 주"의 week_start를 구할 때 사용.
 * DB의 week_start_kst(DATE)와 동일하게 월요일을 주 시작으로 본다.
 *
 * ⚠️ 영업일 경계 보정: 클럽은 새벽까지 영업하므로, 방문이 월요일 새벽(6시 이전)이면
 *    영업일상 일요일 = 직전 주에 속한다. getBusinessDowKey와 같은 기준으로 보정해,
 *    "방문 시점에 활성인 슬롯"(월18시~다음월18시)과 어긋나지 않게 한다.
 *
 * @param dateISO "YYYY-MM-DD" 또는 ISO 날짜 문자열 (KST 날짜로 취급)
 */
export function getWeekStartForDate(dateISO: string): string {
  // 날짜 부분만 사용 (KST 캘린더 날짜로 취급). UTC 자정 기준 Date 생성.
  const datePart = dateISO.slice(0, 10);
  const base = new Date(`${datePart}T00:00:00Z`);

  // 영업일 경계: 입력에 시각 정보가 있고 새벽 6시 이전이면 전날로 간주.
  // (방문일은 보통 날짜만 들어오므로 대개 영향 없음 — 일관성/안전용)
  const hasTime = dateISO.length > 10;
  if (hasTime) {
    const kst = new Date(new Date(dateISO).getTime() + 9 * 60 * 60 * 1000);
    if (kst.getUTCHours() < BUSINESS_DAY_CUTOFF_HOUR) {
      base.setUTCDate(base.getUTCDate() - 1);
    }
  }

  // 그 주의 월요일로 거슬러 (0=일 → 6일 전, 그 외 → dow-1일 전)
  const dow = base.getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  base.setUTCDate(base.getUTCDate() - daysFromMonday);
  return base.toISOString().slice(0, 10);
}

/**
 * 게스트 간판 "오늘 요일" 키(sun~sat)를 영업일 기준으로 반환.
 *
 * ⚠️ 클럽은 새벽까지 영업하므로, 일요일 밤에 놀러 간 손님이 월요일 새벽에 봐도
 *    "일요일 혜택"이 보여야 한다. 달력 자정(00:00)에 요일을 넘기면 새벽에 혜택이 사라진다.
 *    → 새벽 6시 KST 이전이면 전날 요일로 간주한다.
 *    MD 입력 화면(HotdealSlotBoard)의 영업일 로직과 기준을 통일.
 */
export function getBusinessDowKey(): HotdealDow {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  if (kst.getUTCHours() < BUSINESS_DAY_CUTOFF_HOUR) {
    kst.setUTCDate(kst.getUTCDate() - 1);
  }
  const DOW_KEYS: HotdealDow[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return DOW_KEYS[kst.getUTCDay()];
}

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
