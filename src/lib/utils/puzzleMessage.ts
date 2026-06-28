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

function formatMsgDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}/${day}(${days[d.getDay()]})`;
}

function formatMsgDateEn(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const AREA_EN_MSG: Record<string, string> = {
  "강남": "Gangnam", "홍대": "Hongdae", "이태원": "Itaewon",
  "서울 어디든": "Anywhere in Seoul",
  "부산": "Busan", "대구": "Daegu", "인천": "Incheon",
  "광주": "Gwangju", "대전": "Daejeon", "울산": "Ulsan", "세종": "Sejong",
};

export function buildAcceptedFlagMessage(
  puzzle: PuzzleLite,
  offer: AcceptedOfferLite,
  origin: string,
  isForeigner = false,
): string {
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

  // 외국인: 한국어 전문(MD가 읽고 예약) + 영어 전문(외국인이 확인) 분리
  const dateEn = formatMsgDateEn(puzzle.event_date);
  const areaEn = AREA_EN_MSG[puzzle.area] ?? puzzle.area;
  const headcountEn = `${puzzle.is_recruiting_party ? puzzle.current_count : puzzle.target_count} ppl`;
  const enInfo: string[] = [`${dateEn} · ${areaEn} · ${headcountEn}`];
  if (offer) {
    enInfo.push(`${club || "Club"} · ₩${price}`);
    if (offer.includes.length > 0) {
      enInfo.push(offer.includes.map(toEnglishInclude).join(", "));
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
    `Hi! I'm a NightFlow guest 🙌`,
    `I accepted your offer — please help me book!`,
    ``,
    ...enInfo,
    ``,
    url,
  ].join("\n");
}
