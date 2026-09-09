// 외국어 클럽 상세(/{en,ja,zh,zh-tw}/clubs/[area]/[club])의 "예약" SEO 조각.
//
// 4개 언어 페이지가 파일 복제 관례라(각 page.tsx 상단 주석 참고) 예약 관련 문구·
// 구조화 데이터를 페이지마다 또 복제하면 다음에 가격 규칙이 바뀔 때 4곳을 고쳐야 한다.
// 그래서 언어를 인자로 받는 함수로 한 곳에 모은다. 화면 섹션은 ClubBookingSection.
//
// 구조화 데이터 방침:
//   - 예약 가능(bookable) 클럽에만 Offer·ReserveAction을 단다. 못 잡아주는 클럽에
//     "예약 가능"을 선언하면 검색결과가 거짓말이 된다(FAQ와 같은 원칙).
//   - lowPrice = tableFrom(폼 카드와 같은 숫자). highPrice = 메뉴 최고가.
//   - geo는 예약 여부와 무관하게 전부 — 지도 검색("clubs near Itaewon station")용.
//
// 어휘(크리틱 1차 반영): zh-tw는 대만 실제 검색어 기준 — 일반 테이블은 桌位, 예약 동사는
// 訂桌/訂位, 最低消費는 低消. 包廂은 밀폐 VIP룸 어감이라 안 쓴다. zh(대륙)는 卡座/预订/最低消费.
// ja는 "予約最低額" 대신 "最低予約金額". 응답 약속은 폼 문구("Most requests get a reply
// within hours")와 맞춰 "보통 몇 시간 안"으로 — 24시간 SLA를 새로 만들지 않는다.
// zh-tw 구두점은 기존 /zh-tw 페이지 관례(반각 쉼표)를 따른다 — 한 description 안에서 전각·반각이 섞이지 않게.
//
// "2~3개면 최저소비 도달"(크리틱 2차): 최저 항목이 ₩40,000인 클럽에선 거짓이라
// itemsToReachFloor로 계산해 3개 이하일 때만 그 문장을 쓴다.

import type { ClubPriceSummary } from "@/lib/clubs/tablePricing";
import { tableFrom, formatWon, wonCompact, bookingFloor, itemsToReachFloor } from "@/lib/clubs/tablePricing";

export type SeoLang = "en" | "ja" | "zh" | "zh-tw";

type Copy = {
  titleBookable: (name: string, area: string, from: string) => string;
  titleInfo: (name: string, area: string) => string;
  /** description 앞머리 — 예약 가능. fc = 언어별 축약(50万ウォン), f = ₩500,000 */
  descPrice: (name: string, f: string, fc: string) => string;
  /** description — 예약 불가: 이 클럽은 못 잡지만 근처는 된다 */
  descAlt: (area: string) => string;
  faqPriceQ: (name: string) => string;
  /**
   * 최저소비가 최저 항목보다 클 때: 두 숫자를 다른 개념으로 분리.
   * reachIn = 최저 항목으로 최저소비를 채우는 개수(≤3이면 "2~3개" 문장, 아니면 "여러 개 조합").
   */
  faqPriceA: (name: string, f: string, area: string, lowest: string | null, reachIn: number | null) => string;
  faqHowQ: (name: string) => string;
  faqHowA: (name: string) => string;
  keywords: (name: string, area: string) => string[];
  cta: (name: string, from: string | null) => string;
  /** 비예약 페이지 스티키바 — 대안 클럽으로 */
  ctaAlt: (altName: string, from: string) => string;
};

const COPY: Record<SeoLang, Copy> = {
  en: {
    titleBookable: (n, a, f) => `${n} ${a} — Book a Table from ${f} | NightFlow`,
    titleInfo: (n, a) => `${n} ${a} — Entry Fee, Hours & Reviews | NightFlow`,
    descPrice: (n, f) => `Tables at ${n} from ${f} minimum spend — real menu prices, book in English, no broker fee.`,
    descAlt: (a) => `See which ${a} clubs you can book right now with real table prices.`,
    faqPriceQ: (n) => `How much is a table at ${n}?`,
    faqPriceA: (n, f, a, lowest, reachIn) =>
      lowest && lowest !== f
        ? `The booking minimum at ${n} through NightFlow is ${f} per table (this is the ${a}-wide minimum). Bottles and sets on the menu start at ${lowest}` +
          (reachIn != null && reachIn <= 3 ? `, so most groups reach the minimum with two or three items.` : `; you combine several to reach the minimum.`) +
          ` You pick from the club's real menu — the total you see is what you pay at the club.`
        : `Table bookings at ${n} through NightFlow start at ${f}. You pick items from the club's real menu, so the total you see is the price you pay at the club.`,
    faqHowQ: (n) => `How do I book a table at ${n}?`,
    faqHowA: (n) =>
      `Choose your date and group size, pick bottles from ${n}'s menu, and leave your contact. NightFlow confirms directly with ${n} in Korean and replies to you in English — most requests get a reply within hours. No deposit, no broker fee; you pay the club on the night.`,
    keywords: (n, a) => [`${n} table price`, `${n} bottle service price`, `${n} VIP table`, `${n} minimum spend`, `book ${n}`, `${a} table booking`, `${a} bottle service`],
    cta: (n, f) => (f ? `🍾 Book ${n} · from ${f}` : `🍾 Book ${n}`),
    ctaAlt: (alt, f) => `🍾 Book ${alt} instead · from ${f}`,
  },
  ja: {
    titleBookable: (n, a, f) => `${n} ${a} — テーブル予約 ${f}〜 | NightFlow`,
    titleInfo: (n, a) => `${n} ${a} — 営業時間・入場料・口コミ | NightFlow`,
    descPrice: (n, f, fc) => `${n}のテーブルは最低${fc}（${f}）〜。実際のメニュー価格で日本語予約、仲介手数料なし。`,
    descAlt: (a) => `${a}で今すぐ予約できるクラブと実際のテーブル料金はこちら。`,
    faqPriceQ: (n) => `${n}のテーブル料金はいくらですか？`,
    faqPriceA: (n, f, a, lowest, reachIn) =>
      lowest && lowest !== f
        ? `NightFlow経由の${n}テーブル予約は1卓あたり最低${f}（${a}エリア共通の最低予約金額）です。メニューのボトル・セット自体は${lowest}〜で` +
          (reachIn != null && reachIn <= 3 ? `、多くのグループは2〜3品で最低金額に達します。` : `、複数を組み合わせて最低金額に達します。`) +
          `クラブの実際のメニューから選ぶので、表示合計がそのまま当日のお支払い額です。`
        : `NightFlow経由の${n}テーブル予約は${f}〜です。クラブの実際のメニューから選ぶので、表示合計がそのまま当日のお支払い額です。`,
    faqHowQ: (n) => `${n}のテーブルはどう予約しますか？`,
    faqHowA: (n) =>
      `日程と人数を選び、${n}のメニューからボトルを選んで連絡先を残すだけ。NightFlowが${n}に韓国語で直接確認し、日本語でご返信します — 多くの場合数時間以内です。デポジット不要・仲介手数料なし、お支払いは当日クラブで。`,
    keywords: (n, a) => [`${n} テーブル料金`, `${n} ボトル 値段`, `${n} VIP`, `${n} 最低料金`, `${n} 予約方法`, `${a} テーブル予約`, `${a} ボトルサービス`],
    cta: (n, f) => (f ? `🍾 ${n}を予約 · ${f}〜` : `🍾 ${n}を予約`),
    ctaAlt: (alt, f) => `🍾 代わりに${alt}を予約 · ${f}〜`,
  },
  zh: {
    titleBookable: (n, a, f) => `${n} ${a} — 卡座预订 ${f}起 | NightFlow`,
    titleInfo: (n, a) => `${n} ${a} — 入场费・营业时间・点评 | NightFlow`,
    descPrice: (n, f, fc) => `${n}卡座最低消费${fc}（${f}）起 — 真实酒单价格，中文预订，无中介费。`,
    descAlt: (a) => `看看${a}现在就能预订的夜店和真实卡座价格。`,
    faqPriceQ: (n) => `${n}的卡座多少钱？`,
    faqPriceA: (n, f, a, lowest, reachIn) =>
      lowest && lowest !== f
        ? `通过 NightFlow 预订${n}卡座，每桌最低消费${f}（${a}区域统一的最低消费）。酒单上的酒水和套餐从${lowest}起` +
          (reachIn != null && reachIn <= 3 ? `，多数人点2〜3项即可达到最低消费。` : `，组合几项即可达到最低消费。`) +
          `您直接从夜店真实酒单选酒，看到的总额就是当晚在夜店支付的价格。`
        : `通过 NightFlow 预订${n}卡座${f}起。您直接从夜店真实酒单选酒，看到的总额就是当晚在夜店支付的价格。`,
    faqHowQ: (n) => `怎样预订${n}的卡座？`,
    faqHowA: (n) =>
      `选择日期和人数，从${n}的酒单选酒，留下联系方式即可。NightFlow 会用韩语直接向${n}确认，并用中文回复您 — 多数请求几小时内回复。无需押金、无中介费，当晚在夜店付款。`,
    keywords: (n, a) => [`${n} 卡座价格`, `${n} 酒水价格`, `${n} VIP卡座`, `${n} 最低消费`, `${n} 怎么预订`, `${a} 卡座预订`, `${a} 夜店最低消费`],
    cta: (n, f) => (f ? `🍾 预订 ${n} · ${f}起` : `🍾 预订 ${n}`),
    ctaAlt: (alt, f) => `🍾 此店暂不可订 · 改订 ${alt} · ${f}起`,
  },
  "zh-tw": {
    titleBookable: (n, a, f) => `${n} ${a} — 夜店訂桌 ${f}起 | NightFlow`,
    titleInfo: (n, a) => `${n} ${a} — 入場費・營業時間・評價 | NightFlow`,
    descPrice: (n, f, fc) => `${n}桌位低消${fc}(${f})起 — 真實酒單價格,中文訂桌,無中介費。`,
    descAlt: (a) => `看看${a}現在就能訂桌的夜店和真實桌位價格。`,
    faqPriceQ: (n) => `${n}的桌位多少錢？`,
    faqPriceA: (n, f, a, lowest, reachIn) =>
      lowest && lowest !== f
        ? `透過 NightFlow 在${n}訂桌,每桌低消${f}(${a}區域統一的低消)。酒單上的酒水和套餐從${lowest}起` +
          (reachIn != null && reachIn <= 3 ? `,多數人點2〜3項即可達到低消。` : `,組合幾項即可達到低消。`) +
          `您直接從夜店真實酒單選酒,看到的總額就是當晚在夜店支付的價格。`
        : `透過 NightFlow 在${n}訂桌${f}起。您直接從夜店真實酒單選酒,看到的總額就是當晚在夜店支付的價格。`,
    faqHowQ: (n) => `怎麼在${n}訂桌？`,
    faqHowA: (n) =>
      `選擇日期和人數,從${n}的酒單選酒,留下聯絡方式即可。NightFlow 會用韓語直接向${n}確認,並用中文回覆您 — 多數請求幾小時內回覆。免訂金、無中介費,當晚在夜店付款。`,
    keywords: (n, a) => [`${n} 桌位價格`, `${n} 酒水價格`, `${n} VIP 桌位`, `${n} 低消`, `${n} 怎麼訂桌`, `${a} 夜店訂桌`, `${a} 夜店低消`],
    cta: (n, f) => (f ? `🍾 訂桌 ${n} · ${f}起` : `🍾 訂桌 ${n}`),
    ctaAlt: (alt, f) => `🍾 此店暫不可訂 · 改訂 ${alt} · ${f}起`,
  },
};

export function bookingCopy(lang: SeoLang): Copy {
  return COPY[lang];
}

export type BookingSeoInput = {
  lang: SeoLang;
  name: string;
  /** 언어별 지역 표기(Itaewon / 梨泰院) */
  areaLabel: string;
  /** DB 지역명(한국어) — 하한 조회용 */
  areaKo: string;
  bookable: boolean;
  pricing: ClubPriceSummary | null | undefined;
};

/** title·description·keywords·CTA에 쓸 계산값 한 벌 */
export function bookingSeoBits(input: BookingSeoInput) {
  const c = COPY[input.lang];
  const from = input.bookable ? tableFrom(input.areaKo, input.pricing) : null;
  const fromCompact = from != null ? wonCompact(from, input.lang) : null;
  return {
    from,
    title: from != null
      ? c.titleBookable(input.name, input.areaLabel, fromCompact!)
      : c.titleInfo(input.name, input.areaLabel),
    descPrice: from != null ? c.descPrice(input.name, formatWon(from), fromCompact!) : null,
    descAlt: c.descAlt(input.areaLabel),
    keywords: from != null ? c.keywords(input.name, input.areaLabel) : [],
    cta: c.cta(input.name, fromCompact),
    ctaAlt: (altName: string, altFrom: number) => c.ctaAlt(altName, wonCompact(altFrom, input.lang)),
  };
}

/** FAQPage에 추가할 예약 Q&A — 예약 가능 + 가격 있을 때만 */
export function bookingFaqs(input: BookingSeoInput): { q: string; a: string }[] {
  const from = input.bookable ? tableFrom(input.areaKo, input.pricing) : null;
  if (from == null) return [];
  const c = COPY[input.lang];
  const lowestBase = input.pricing?.lowestSet ?? input.pricing?.lowestItem ?? null;
  const lowest = lowestBase != null ? formatWon(lowestBase) : null;
  return [
    { q: c.faqPriceQ(input.name), a: c.faqPriceA(input.name, formatWon(from), input.areaLabel, lowest, itemsToReachFloor(input.areaKo, input.pricing)) },
    { q: c.faqHowQ(input.name), a: c.faqHowA(input.name) },
  ];
}

/**
 * NightClub 노드에 spread 할 조각 — geo(항상), priceRange·makesOffer·potentialAction(예약 가능 시).
 * 값이 없는 키는 아예 넣지 않는다(undefined는 JSON.stringify가 빼주지만 명시적으로).
 */
export function bookingJsonLdFragment(args: {
  input: BookingSeoInput;
  url: string;
  bookUrl: string;
  latitude?: number | null;
  longitude?: number | null;
}): Record<string, unknown> {
  const { input, url, bookUrl, latitude, longitude } = args;
  const frag: Record<string, unknown> = {};
  if (typeof latitude === "number" && typeof longitude === "number") {
    frag.geo = { "@type": "GeoCoordinates", latitude, longitude };
  }
  const from = input.bookable ? tableFrom(input.areaKo, input.pricing) : null;
  if (from == null) return frag;

  const high = input.pricing?.highest && input.pricing.highest > from ? input.pricing.highest : from;
  const offerCount = Math.max(1, input.pricing?.setCount || input.pricing?.itemCount || 1);
  const inLanguage = input.lang === "zh-tw" ? "zh-TW" : input.lang === "zh" ? "zh-CN" : input.lang === "ja" ? "ja" : "en";
  frag.priceRange = `${formatWon(from)}~`;
  frag.makesOffer = {
    "@type": "AggregateOffer",
    "@id": `${url}#tables`,
    name: `${input.name} table booking`,
    priceCurrency: "KRW",
    lowPrice: from,
    highPrice: high,
    offerCount,
    availability: "https://schema.org/InStock",
    url: bookUrl,
  };
  // Reserve with Google 파트너가 아니라 SERP 표면은 없다 — 의도 선언용. 기대 금지.
  frag.potentialAction = {
    "@type": "ReserveAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: bookUrl,
      inLanguage,
      actionPlatform: ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform"],
    },
    result: { "@type": "Reservation" },
  };
  // 예약 하한은 지역 공통 — 스니펫이 "이 클럽만의 가격"으로 오해하지 않게 하한을 별도 값으로도 준다
  frag.additionalProperty = [{
    "@type": "PropertyValue",
    name: "Minimum table spend",
    value: bookingFloor(input.areaKo),
    unitCode: "KRW",
  }];
  return frag;
}
