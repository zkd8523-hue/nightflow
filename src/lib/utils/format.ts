import dayjs from "dayjs";
import {
  getOfferDeadline as getPuzzleOfferDeadline,
  getOfferDeadlineLabel as getPuzzleOfferDeadlineLabel,
} from "@/lib/utils/puzzleDeadline";

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

/**
 * 카드용 단축 입장시간 포맷 (우상단 absolute 영역 폭 절약)
 * "22:00" → "22:00"
 * "01:00" (hour<4) → "5/9 01:00"
 * null → "즉시"
 */
export function formatEntryTimeShort(entryTime: string | null, eventDate: string): string {
  if (!entryTime) return "즉시";
  const [h] = entryTime.split(":").map(Number);
  if (h < 4) {
    const nextDay = dayjs(eventDate).add(1, "day");
    return `${nextDay.format("M/D")} ${entryTime}`;
  }
  return entryTime;
}

type PuzzleLike = {
  status: string;
  event_date: string;
  offer_deadline: string | null;
  expires_at: string;
  is_recruiting_party?: boolean;
};

/**
 * "오늘 오후 8시에 오퍼가 마감됩니다" 시스템 룰 안내 메시지.
 * - 조건: 그룹 내 event_date가 오늘인 깃발이 1개라도 존재 + 현재가 8pm KST 이전
 * - 개별 깃발의 offer_deadline 유무와 무관 (정책 안내이므로)
 * - 해당 없으면 null (표시 안 함)
 */
export function getPuzzleGroupDeadline(puzzles: PuzzleLike[]): string | null {
  if (puzzles.length === 0) return null;
  const now = dayjs();

  const hasTodayPuzzle = puzzles.some(
    (p) => p.event_date && dayjs(p.event_date).isSame(now, "day")
  );
  if (!hasTodayPuzzle) return null;

  // 조각은 자정, 깃발은 오후 8시 마감. 그룹이 섞여 있으면 먼저 닫히는 깃발 기준으로 안내한다.
  const isShareGroup = puzzles.every((p) => p.is_recruiting_party);
  const today = now.format("YYYY-MM-DD");
  const offerDeadline = dayjs(getPuzzleOfferDeadline(today, isShareGroup));
  if (!offerDeadline.isAfter(now)) return null;

  return `${getPuzzleOfferDeadlineLabel(isShareGroup)}에 오퍼가 마감됩니다`;
}

/**
 * 이벤트 날짜로부터 D-day 라벨 생성.
 * "오늘" / "내일" / "D-N" / "D+N" 반환.
 */
export function getDDayLabel(eventDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(eventDate);
  event.setHours(0, 0, 0, 0);
  const diff = Math.round((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

/** 상대 시간 포맷 (당근 스타일): "방금" / "x분 전" / "x시간 전" / "x일 전" */
export function formatRelativeTime(date: string): string {
  const now = dayjs();
  const target = dayjs(date);
  const diffSec = now.diff(target, "second");

  if (diffSec < 60) return "방금";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
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

/** 주류 가격 구간 라벨 (예: "20만원대~", "20만원대~40만원대"). min이 없으면 null. */
export function formatPriceBucket(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min == null) return null;
  const tier = Math.floor(min / 100000) * 10; // 만원 단위 십의자리로 내림
  if (max == null) return `${tier}만원대~`;
  const maxTier = Math.floor(max / 100000) * 10;
  return maxTier > tier ? `${tier}만원대~${maxTier}만원대` : `${tier}만원대`;
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

/** 장기 카운트다운 포맷 (24h 초과): seconds → "3일 17:51" */
export function formatCountdownLong(seconds: number): string {
  if (seconds <= 0) return "마감";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  if (days > 0) return `${days}일 ${hh}:${mm}`;
  return `${hh}:${mm}`;
}


/**
 * 깃발 일행 성별 구성 라벨.
 * target_male/target_female 기반. 성별 무관(둘 다 0)이면 총원("N명")으로 폴백.
 * 예) 남3+여1 → "남3 여1", 남4+여0 → "남4", en → "M3 F1"
 */
export function formatGenderComposition(
  male: number | null | undefined,
  female: number | null | undefined,
  totalCount: number,
  lang: "ko" | "en" = "ko"
): string {
  const m = male ?? 0;
  const f = female ?? 0;
  if (m + f === 0) return lang === "en" ? `${totalCount} ppl` : `${totalCount}명`;
  const mL = lang === "en" ? "M" : "남";
  const fL = lang === "en" ? "F" : "여";
  const parts: string[] = [];
  if (m > 0) parts.push(`${mL}${m}`);
  if (f > 0) parts.push(`${fL}${f}`);
  return parts.join(" ");
}


/**
 * 예약 연락처 입력값 정규화 (korean_booking_requests.contact_value).
 *
 * 채널마다 형태가 완전히 달라서 한 함수로 분기한다 —
 *   phone:    숫자만 남기고 010-1234-5678 꼴로 하이픈 자동 삽입 (최대 11자리)
 *   instagram: 공백 제거 + 앞 @는 하나만 유지 (인스타 핸들 최대 30자)
 *   openchat:  URL이라 공백만 제거하고 길이 상한만 둔다
 *
 * 입력 중에 호출되므로(onChange) 미완성 값도 그대로 통과시켜야 한다 —
 * 검증(validateContact)은 제출 시점에 따로 한다.
 */
export function formatBookingContact(
  type: "phone" | "instagram" | "openchat",
  raw: string
): string {
  if (type === "phone") {
    // 숫자만 추출. 국내 번호 기준 최대 11자리(010 + 8자리).
    const d = raw.replace(/\D/g, "").slice(0, 11);
    // 02(서울 지역번호)만 2자리, 나머지는 3자리 국번으로 끊는다.
    const head = d.startsWith("02") ? 2 : 3;
    if (d.length <= head) return d;
    const rest = d.slice(head);
    // 뒤 4자리를 항상 마지막 블록으로 떼어낸다. 그래야 입력 도중에
    // "010-123-4"처럼 어색하게 끊기지 않고 "010-1234"로 자연스럽게 이어진다.
    // 마지막 블록이 다 차기 전(rest ≤ 4)에는 하이픈을 하나만 둔다.
    if (rest.length <= 4) return `${d.slice(0, head)}-${rest}`;
    const mid = rest.slice(0, rest.length - 4);
    const tail = rest.slice(rest.length - 4);
    return `${d.slice(0, head)}-${mid}-${tail}`;
  }
  if (type === "instagram") {
    const h = raw.replace(/\s/g, "").replace(/^@+/, "");
    return h ? `@${h.slice(0, 30)}` : "";
  }
  // openchat: URL. 공백만 털고 상한만 둔다.
  return raw.replace(/\s/g, "").slice(0, 200);
}
