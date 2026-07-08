import type { Lang } from "@/lib/i18n";

/**
 * 클럽 DB의 한국어 원본 문자열(entry_fee_detail, operating_hours)을 외국인 트랙에서
 * 자연스럽게 보이도록 요일·통화·자주 쓰는 단어만 언어별로 치환.
 *
 * DB 스키마 변경 없이 즉시 적용 가능한 하이브리드 방식. 완벽한 번역이 아니라
 * "한국어를 못 읽는 유저가 정보를 이해할 수 있는 수준"이 목표.
 *
 * 대상 예시:
 *   entry_fee_detail: "15,000원~ (1 free drink 포함)" → "₩15,000+ (1 free drink included)"
 *   operating_hours: "금/토 22:00-05:00 / 평일 21:00-04:00" → "Fri/Sat 22:00-05:00 / Weekdays 21:00-04:00"
 */

// 요일 매핑 (한국어 → 각 언어)
const DAY_MAP: Record<Lang, Record<string, string>> = {
  ko: {},
  en: {
    "월": "Mon", "화": "Tue", "수": "Wed", "목": "Thu", "금": "Fri", "토": "Sat", "일": "Sun",
    "평일": "Weekdays", "주말": "Weekends", "매일": "Daily",
    "연중무휴": "Open every day",
  },
  ja: {
    "월": "月", "화": "火", "수": "水", "목": "木", "금": "金", "토": "土", "일": "日",
    "평일": "平日", "주말": "週末", "매일": "毎日",
    "연중무휴": "年中無休",
  },
  zh: {
    "월": "周一", "화": "周二", "수": "周三", "목": "周四", "금": "周五", "토": "周六", "일": "周日",
    "평일": "工作日", "주말": "周末", "매일": "每天",
    "연중무휴": "全年无休",
  },
  "zh-tw": {
    "월": "週一", "화": "週二", "수": "週三", "목": "週四", "금": "週五", "토": "週六", "일": "週日",
    "평일": "平日", "주말": "週末", "매일": "每天",
    "연중무휴": "全年無休",
  },
};

// 자주 쓰는 단어 매핑
const WORD_MAP: Record<Lang, Record<string, string>> = {
  ko: {},
  en: {
    "포함": "included",
    "무료입장": "Free entry",
    "무료": "Free",
    "여성": "Women",
    "남성": "Men",
    "여자": "Women",
    "남자": "Men",
    "게스트": "Guest",
    "프리드링크": "Free drink",
    "이상": "+",
    "부터": "from",
    "까지": "until",
    // 성별 단일 문자 — "남 20,000원" / "여 무료" 같은 패턴 대응
    "남 ": "Men ",
    "여 ": "Women ",
  },
  ja: {
    "포함": "込み",
    "무료입장": "入場無料",
    "무료": "無料",
    "여성": "女性",
    "남성": "男性",
    "여자": "女性",
    "남자": "男性",
    "게스트": "ゲスト",
    "프리드링크": "フリードリンク",
    "이상": "以上",
    "부터": "から",
    "까지": "まで",
    "남 ": "男 ",
    "여 ": "女 ",
  },
  zh: {
    "포함": "含",
    "무료입장": "免费入场",
    "무료": "免费",
    "여성": "女士",
    "남성": "男士",
    "여자": "女士",
    "남자": "男士",
    "게스트": "嘉宾",
    "프리드링크": "免费饮品",
    "이상": "以上",
    "부터": "起",
    "까지": "至",
    "남 ": "男士 ",
    "여 ": "女士 ",
  },
  "zh-tw": {
    "포함": "含",
    "무료입장": "免費入場",
    "무료": "免費",
    "여성": "女士",
    "남성": "男士",
    "여자": "女士",
    "남자": "男士",
    "게스트": "嘉賓",
    "프리드링크": "免費飲品",
    "이상": "以上",
    "부터": "起",
    "까지": "至",
    "남 ": "男士 ",
    "여 ": "女士 ",
  },
};

/**
 * "원" 통화 단위를 언어별로 치환. 숫자 앞에 통화 기호 붙임.
 *   "15,000원" → "₩15,000" (모든 외국어 공통, 원화 기호가 국제 표준)
 *   "15,000원~" → "₩15,000+"
 */
function replaceCurrency(s: string, lang: Lang): string {
  if (lang === "ko") return s;
  // "숫자,숫자원~" → "₩숫자+"
  return s
    .replace(/(\d[\d,]*)원~/g, "₩$1+")
    .replace(/(\d[\d,]*)원/g, "₩$1");
}

/**
 * 클럽 메타 문자열(입장료·영업시간 등)을 외국인 트랙에 맞게 부분 번역.
 * ko 언어는 원본 그대로 반환.
 */
export function translateClubMeta(s: string | null | undefined, lang: Lang): string {
  if (!s) return "";
  if (lang === "ko") return s;

  let out = s;

  // 요일: 긴 것 먼저 (평일/주말/연중무휴), 짧은 것(월/화 등) 나중
  const days = DAY_MAP[lang];
  const dayKeys = Object.keys(days).sort((a, b) => b.length - a.length);
  for (const ko of dayKeys) {
    out = out.replaceAll(ko, days[ko]);
  }

  // 단어: 긴 것 먼저 (무료입장) 짧은 것(무료) 나중
  const words = WORD_MAP[lang];
  const wordKeys = Object.keys(words).sort((a, b) => b.length - a.length);
  for (const ko of wordKeys) {
    out = out.replaceAll(ko, words[ko]);
  }

  // 통화 치환 (숫자 뒤 원 → ₩)
  out = replaceCurrency(out, lang);

  return out;
}
