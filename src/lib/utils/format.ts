import dayjs from "dayjs";

/** 가격 포맷: 230000 → "230,000원" */
export function formatPrice(price: number): string {
  return `${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

/** 가격 포맷 (원 제외): 230000 → "230,000" */
export function formatNumber(num: number): string {
  return num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "0";
}

/** 
 * 포함 사항 요약 포맷: 
 * ["샴페인 1병", "기본 안주", "과일"] → "샴페인 1병 · 기본 안주 외 1건" 
 */
export function formatIncludes(includes: string[], maxItems = 2): string {
  if (!includes || includes.length === 0) return "";
  if (includes.length <= maxItems) return includes.join(" · ");

  const mainItems = includes.slice(0, maxItems).join(" · ");
  return `${mainItems} 외 ${includes.length - maxItems}건`;
}

/** 날짜 포맷: "2026-02-18" → "2월 18일 (수)" */
export function formatDate(date: string): string {
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const d = dayjs(date);
  return `${d.format("M월 D일")} (${DAYS[d.day()]})`;
}

/** 방문 날짜 포맷: "2026-03-28" → "3/28 (토)" */
export function formatEventDate(eventDate: string): string {
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const event = dayjs(eventDate);
  return `${event.format("M/D")} (${DAYS[event.day()]})`;
}

/**
 * 입장 시간 포맷 (심야 새벽 시간대는 실제 캘린더 날짜 표시)
 * "22:00" → "22:00 입장"
 * "01:00" (hour<4) → "3/29 (일) 01:00 입장"
 * null → "즉시 입장"
 */
export function formatEntryTime(entryTime: string | null, eventDate: string): string {
  if (!entryTime) return "즉시 입장 가능";
  const [h] = entryTime.split(":").map(Number);
  if (h < 4) {
    const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
    const nextDay = dayjs(eventDate).add(1, "day");
    return `${nextDay.format("M/D")} (${DAYS[nextDay.day()]}) ${entryTime}~ 입장`;
  }
  return `${entryTime}~ 입장`;
}

/** 시간 포맷: "2026-02-18T20:00:00" → "오후 8:00" */
export function formatTime(datetime: string): string {
  const d = dayjs(datetime);
  const hour = d.hour();
  const minute = d.minute();
  const period = hour < 12 ? "오전" : "오후";
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${period} ${h}:${minute.toString().padStart(2, "0")}`;
}

/** 주류/부가 서비스 분류 */
export function categorizeLiquor(includes: string[]): {
  liquor: string[];
  extras: string[];
} {
  const keywords = [
    "병", "하드", "샴페인", "보드카", "위스키", "와인", "럼", "데킬라", "진",
    "모엣", "그레이구스", "잭다니엘", "발렌타인", "맥캘란", "맥켈란", "돔 페리뇽",
    "꼬냑", "헤네시", "헨네시", "레미마틴", "마르텔", "루이 13세", "까뮈",
    "패트론", "봄베이", "바카디", "벨베디어", "조니워커", "벨루가",
    "로얄살루트", "글렌피딕", "시바스", "뵈브", "크리스탈",
    "스노우레퍼드", "시록", "앱솔루트", "스미노프",
    "호세", "돈 훌리오", "카사미고스", "올메카", "클라세",
    "짐빔", "핀란디아", "케텔원",
    "캡틴모건", "핸드릭스", "탱커레이", "고든스", "말리부", "하바나",
    "맥주", "소주", "하이볼", "논알콜",
  ];

  return {
    liquor: (includes || []).filter((item) =>
      keywords.some((kw) => item.includes(kw))
    ),
    extras: (includes || []).filter((item) =>
      !keywords.some((kw) => item.includes(kw))
    ),
  };
}

/**
 * 주류 우선 표시:
 * ["잭다니엘 2병", "기본 안주", "모엣 샹동 1병"] → "잭다니엘 2병 · 모엣 샹동 1병 외 1건"
 */
export function formatLiquorFirst(includes: string[], maxLiquor = 2): string {
  if (!includes || includes.length === 0) return "";
  const { liquor } = categorizeLiquor(includes);
  if (liquor.length === 0) return formatIncludes(includes, 2);

  const display = liquor.slice(0, maxLiquor);
  const remaining = includes.length - display.length;
  if (remaining === 0) return display.join(" · ");
  return `${display.join(" · ")} 외 ${remaining}건`;
}

/** 주류 카테고리별 색상 스타일 */
export const DRINK_CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  champagne: { bg: "bg-yellow-500/15", text: "text-yellow-300", border: "border-yellow-500/20" },
  vodka:     { bg: "bg-sky-500/15",    text: "text-sky-300",    border: "border-sky-500/20" },
  whisky:    { bg: "bg-amber-600/15",  text: "text-amber-400",  border: "border-amber-600/20" },
  tequila:   { bg: "bg-lime-500/15",   text: "text-lime-300",   border: "border-lime-500/20" },
  cognac:    { bg: "bg-orange-700/15", text: "text-orange-300", border: "border-orange-700/20" },
  wine:      { bg: "bg-rose-500/15",   text: "text-rose-300",   border: "border-rose-500/20" },
  rum:       { bg: "bg-orange-500/15", text: "text-orange-300", border: "border-orange-500/20" },
  gin:       { bg: "bg-teal-500/15",   text: "text-teal-300",   border: "border-teal-500/20" },
  etc:       { bg: "bg-purple-500/15", text: "text-purple-300", border: "border-purple-500/20" },
  extra:     { bg: "bg-neutral-800/50", text: "text-neutral-500", border: "border-neutral-700/30" },
};

/** 아이템에서 주류 카테고리 판별 */
export function getLiquorCategory(item: string): string {
  const categories: [string, string[]][] = [
    // "하드" 통합: 보드카 + 데킬라 + 진 → vodka 스타일 사용
    ["vodka", [
      "하드", "보드카",
      "그레이구스", "벨베디어", "스노우레퍼드", "시록", "앱솔루트", "스미노프", "핀란디아", "케텔원", "벨루가",
      "데킬라", "호세", "패트론", "돈 훌리오", "카사미고스", "에라두라", "올메카", "클라세", "1800",
      "봄베이", "핸드릭스", "탱커레이", "고든스",
    ]],
    ["champagne", ["샴페인", "모엣", "돔 페리뇽", "아르망", "크리스탈", "뵈브", "페리에", "볼랭저"]],
    ["whisky", ["위스키", "잭다니엘", "짐빔", "발렌타인", "맥캘란", "맥켈란", "조니워커", "로얄살루트", "글렌피딕", "시바스"]],
    ["cognac", ["꼬냑", "헤네시", "헨네시", "레미마틴", "마르텔", "루이 13세", "까뮈"]],
    ["wine", ["와인", "레드와인", "화이트와인", "로제와인", "스파클링"]],
    ["rum", ["럼", "바카디", "캡틴모건", "하바나", "말리부"]],
    ["etc", ["맥주", "소주", "하이볼", "논알콜"]],
  ];

  for (const [category, keywords] of categories) {
    if (keywords.some(kw => item.includes(kw))) return category;
  }

  if (item.includes("병")) return "etc";
  return "extra";
}

/** 주류 우선 정렬 (주류 먼저, 부가서비스 뒤로) */
export function sortByLiquorFirst(includes: string[]): string[] {
  if (!includes || includes.length === 0) return [];
  const { liquor, extras } = categorizeLiquor(includes);
  return [...liquor, ...extras];
}

/** 이름 마스킹: "김민기" → "김*기", "John" → "J**n" */
export function maskName(name: string | null | undefined): string {
  if (!name) return "알 수 없음";
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}

/** 남은 시간 포맷: seconds → "00:14:30" or "3일 01:17:09" */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const totalHours = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${totalHours.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

