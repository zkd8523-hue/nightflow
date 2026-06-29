type PuzzleLite = {
  id: string;
  event_date: string;
  area: string;
  target_count: number;
  current_count: number;
  is_recruiting_party: boolean;
};

type AcceptedOfferLite = {
  proposed_price: number;
  includes: string[];
  club?: { name: string } | null;
} | null | undefined;

import { toEnglishInclude } from "./liquorEn";
import { type Lang, areaLabel } from "@/lib/i18n";

function formatMsgDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}/${day}(${days[d.getDay()]})`;
}

const FOREIGN_LOCALE: Record<string, string> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };
function formatMsgDateForeign(dateStr: string, lang: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(FOREIGN_LOCALE[lang] ?? "en-US", {
    weekday: "short",
    month: lang === "en" ? "short" : "numeric",
    day: "numeric",
  });
}

// 외국인 블록 정적 문구 (언어별)
const MSG_STRINGS: Record<string, { greet: string; ask: string; ppl: (n: number) => string; club: string }> = {
  en: { greet: "Hi! I'm a NightFlow guest 🙌", ask: "I accepted your offer — please help me book!", ppl: (n) => `${n} ppl`, club: "Club" },
  ja: { greet: "こんにちは！NightFlowのゲストです 🙌", ask: "オファーを受けました — 予約をお願いします！", ppl: (n) => `${n}名`, club: "クラブ" },
  zh: { greet: "你好！我是NightFlow的客人 🙌", ask: "我接受了您的报价——请帮我预订！", ppl: (n) => `${n}人`, club: "夜店" },
};

export function buildAcceptedFlagMessage(
  puzzle: PuzzleLite,
  offer: AcceptedOfferLite,
  origin: string,
  lang: Lang = "ko",
): string {
  const isForeigner = lang !== "ko";
  const date = formatMsgDate(puzzle.event_date);
  const headcount = puzzle.is_recruiting_party
    ? `${puzzle.current_count}명`
    : `${puzzle.target_count}명`;
  const url = `${origin}/flags/${puzzle.id}`;

  const club = offer?.club?.name ?? "";
  const price = offer ? offer.proposed_price.toLocaleString() : "";

  // 한글 정보 줄
  const koInfo: string[] = [`${date} · ${puzzle.area} · ${headcount}`];
  if (offer) {
    koInfo.push(`${club || "클럽"} · ${price}원`);
    if (offer.includes.length > 0) koInfo.push(offer.includes.join(", "));
  }

  if (!isForeigner) {
    return [
      `[NightFlow 🧩 퍼즐 오퍼 수락!]`,
      ``,
      ...koInfo,
      ``,
      `예약 안내 부탁드려요!`,
      url,
    ].join("\n");
  }

  // 외국인: 한국어 전문(MD가 읽고 예약) + 외국인 모국어 전문(en/ja/zh) 분리
  const S = MSG_STRINGS[lang] ?? MSG_STRINGS.en;
  const dateF = formatMsgDateForeign(puzzle.event_date, lang);
  const areaF = areaLabel(puzzle.area, lang);
  const headcountF = S.ppl(puzzle.is_recruiting_party ? puzzle.current_count : puzzle.target_count);
  const fInfo: string[] = [`${dateF} · ${areaF} · ${headcountF}`];
  if (offer) {
    fInfo.push(`${club || S.club} · ₩${price}`);
    if (offer.includes.length > 0) {
      // 술 브랜드명은 글로벌 표기(라틴) — en/ja/zh 모두 동일하게 인식
      fInfo.push(offer.includes.map(toEnglishInclude).join(", "));
    }
  }

  return [
    `안녕하세요! 나이트플로우 게스트입니다 🙌`,
    `오퍼 수락했어요. 예약 안내 부탁드립니다!`,
    ``,
    ...koInfo,
    ``,
    `————————————`,
    ``,
    S.greet,
    S.ask,
    ``,
    ...fInfo,
    ``,
    url,
  ].join("\n");
}
