import Link from "next/link";
import { Star } from "lucide-react";
import type { ClubPriceSummary } from "@/lib/clubs/tablePricing";
import { tableFrom, formatWon, bookingFloor, itemsToReachFloor } from "@/lib/clubs/tablePricing";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";
import { krwTo, langToCurrency, type KrwRates } from "@/lib/utils/currency";

// 외국어 클럽 상세의 "예약" 블록(서버 컴포넌트). 4개 언어 페이지가 공유한다.
//
// 왜 필요했나(2026-09-10 해외 SEO 감사): 해외 자연유입 79세션 중 클럽 상세 직접 진입이
// 압도적 1위인데, ① 예약 가능 클럽 페이지에 "얼마부터인지"가 없어 예약 의도 검색어에서
// 지고, ② 유입 상위(sinkhole·b1·aura·hive…)가 대부분 예약 불가 클럽이라 "Not bookable yet"
// 한 줄 + 이름 칩만 보고 나갔다. 여기서 두 경우를 각각 채운다.
//   - 예약 가능: 최저소비(큰 숫자) + 세트/단품 실명 3개 표 + 3단계 절차 + 보장 + CTA + 이웃 카드
//   - 예약 불가: 같은 지역에서 지금 잡을 수 있는 클럽을 "가격 포함 카드"로, 바로 예약 링크
//
// 가격 앵커(크리틱 1·2차 반영): 큰 숫자는 "1탁 최저소비", 그 아래 "메뉴는 ₩X부터"로 개념을
// 분리한다. "2~3개면 최저소비 도달" 문장은 itemsToReachFloor ≤ 3일 때만(₩40,000 세트가 있는
// 클럽에선 거짓이었다). 세트가 없는 클럽(강남 단품 위주)은 최저 단품 3개를 대신 보여준다.
// 숫자는 전부 tablePricing(폼 카드와 같은 규칙)에서 오므로 폼에 들어가 보면 같은 금액이다.

export type AltClub = {
  id: string;
  name: string;
  href: string;
  bookHref: string;
  rating: number | null;
  reviewCount: number | null;
  from: number | null;
};

type Props = {
  lang: SeoLang;
  name: string;
  areaLabel: string;
  areaKo: string;
  /** /{lang}/clubs/{areaSlug}#table-prices 링크용 */
  areaSlug: string;
  bookable: boolean;
  pricing: ClubPriceSummary | null | undefined;
  tableChargeWeekday?: number | null;
  tableChargeWeekend?: number | null;
  bookHref: string;
  alternatives: AltClub[];
  rates?: KrwRates;
};

const T = {
  en: {
    h2: (n: string) => `Book a table at ${n}`,
    minSpend: (a: string) => `Minimum spend per table (${a})`,
    tablesFrom: "Tables from",
    menuFrom: (s: string, reach: number | null) =>
      reach != null && reach <= 3
        ? `Bottles and sets on the menu start at ${s} — most groups reach the minimum with 2–3 items.`
        : `Bottles and sets on the menu start at ${s} — combine a few to reach the minimum.`,
    setsTitle: "Cheapest sets on the menu",
    itemsTitle: "Cheapest bottles on the menu",
    charge: "Table charge",
    chargeWd: "weekday",
    chargeWe: "weekend",
    steps: ["Pick your date, group size and bottles from the real menu.", "We confirm with the club in Korean — most requests get a reply within hours.", "You get the final price in writing. No deposit. Pay the club on the night."],
    trust: ["Real menu prices — the total you see is what you pay", "No broker fee, no deposit", "Paid more than the menu? We refund 200%"],
    cta: (n: string) => `Book ${n}`,
    moreH3: (a: string) => `Other ${a} clubs you can book`,
    notH2: (n: string) => `${n} isn't bookable yet`,
    notP: (n: string, a: string, k: number) => k > 0 ? `We don't handle tables at ${n} yet. These ${a} clubs can be booked right now, in English, with real prices:` : `We don't handle tables at ${n} yet. See which Seoul clubs we can book for you right now.`,
    altFrom: "from",
    altBook: "Book",
    altDetails: "Details",
    reviews: "reviews",
    seeAll: (a: string) => `Compare all ${a} table prices`,
  },
  ja: {
    h2: (n: string) => `${n}のテーブル予約`,
    minSpend: (a: string) => `1卓あたり最低予約金額（${a}）`,
    tablesFrom: "テーブル料金",
    menuFrom: (s: string, reach: number | null) =>
      reach != null && reach <= 3
        ? `メニューのボトル・セットは${s}〜 — 多くのグループは2〜3品で最低金額に達します。`
        : `メニューのボトル・セットは${s}〜 — 複数を組み合わせて最低金額に達します。`,
    setsTitle: "メニュー最安のセット",
    itemsTitle: "メニュー最安のボトル",
    charge: "テーブルチャージ",
    chargeWd: "平日",
    chargeWe: "週末",
    steps: ["日程・人数を選び、実際のメニューからボトルを選択。", "NightFlowがクラブに韓国語で確認 — 多くの場合数時間以内にご返信。", "最終金額を文面でお知らせ。デポジット不要、当日クラブでお支払い。"],
    trust: ["実際のメニュー価格 — 表示合計＝お支払い額", "仲介手数料なし・デポジットなし", "メニューより高く請求されたら200%返金"],
    cta: (n: string) => `${n}を予約`,
    moreH3: (a: string) => `${a}で予約できる他のクラブ`,
    notH2: (n: string) => `${n}はまだ予約できません`,
    notP: (n: string, a: string, k: number) => k > 0 ? `${n}のテーブルはまだお取り扱いしていません。${a}で今すぐ日本語で予約できるクラブ（実際の料金つき）：` : `${n}のテーブルはまだお取り扱いしていません。今すぐ予約できるクラブをご覧ください。`,
    altFrom: "",
    altBook: "予約",
    altDetails: "詳細",
    reviews: "件",
    seeAll: (a: string) => `${a}のテーブル料金をすべて比較`,
  },
  zh: {
    h2: (n: string) => `预订${n}的卡座`,
    minSpend: (a: string) => `每桌最低消费（${a}）`,
    tablesFrom: "卡座价格",
    menuFrom: (s: string, reach: number | null) =>
      reach != null && reach <= 3
        ? `酒单上的酒水和套餐从${s}起 — 多数人点2〜3项即可达到最低消费。`
        : `酒单上的酒水和套餐从${s}起 — 组合几项即可达到最低消费。`,
    setsTitle: "酒单上最便宜的套餐",
    itemsTitle: "酒单上最便宜的酒水",
    charge: "台费",
    chargeWd: "平日",
    chargeWe: "周末",
    steps: ["选择日期、人数，从真实酒单选酒。", "我们用韩语向夜店确认 — 多数请求几小时内回复。", "书面告知最终价格。无需押金，当晚在夜店付款。"],
    trust: ["真实酒单价格 — 看到的总额就是支付额", "无中介费，无需押金", "被多收费？我们赔付200%"],
    cta: (n: string) => `预订 ${n}`,
    moreH3: (a: string) => `${a}其他可预订的夜店`,
    notH2: (n: string) => `${n}暂时无法预订`,
    notP: (n: string, a: string, k: number) => k > 0 ? `我们目前还不能代订${n}的卡座。以下${a}夜店现在就能用中文预订，含真实价格：` : `我们目前还不能代订${n}的卡座。看看现在可以预订的夜店。`,
    altFrom: "",
    altBook: "预订",
    altDetails: "详情",
    reviews: "条评价",
    seeAll: (a: string) => `比较${a}全部卡座价格`,
  },
  "zh-tw": {
    h2: (n: string) => `在${n}訂桌`,
    minSpend: (a: string) => `每桌低消(${a})`,
    tablesFrom: "桌位價格",
    menuFrom: (s: string, reach: number | null) =>
      reach != null && reach <= 3
        ? `酒單上的酒水和套餐從${s}起 — 多數人點2〜3項即可達到低消。`
        : `酒單上的酒水和套餐從${s}起 — 組合幾項即可達到低消。`,
    setsTitle: "酒單上最便宜的套餐",
    itemsTitle: "酒單上最便宜的酒水",
    charge: "桌位費",
    chargeWd: "平日",
    chargeWe: "週末",
    steps: ["選擇日期、人數,從真實酒單選酒。", "我們用韓語向夜店確認 — 多數請求幾小時內回覆。", "書面告知最終價格。免訂金,當晚在夜店付款。"],
    trust: ["真實酒單價格 — 看到的總額就是支付額", "無中介費,免訂金", "被多收費？我們賠付200%"],
    cta: (n: string) => `訂桌 ${n}`,
    moreH3: (a: string) => `${a}其他可訂桌的夜店`,
    notH2: (n: string) => `${n}暫時無法訂桌`,
    notP: (n: string, a: string, k: number) => k > 0 ? `我們目前還不能代訂${n}的桌位。以下${a}夜店現在就能用中文訂桌,含真實價格:` : `我們目前還不能代訂${n}的桌位。看看現在可以訂桌的夜店。`,
    altFrom: "",
    altBook: "訂桌",
    altDetails: "詳情",
    reviews: "則評論",
    seeAll: (a: string) => `比較${a}全部桌位價格`,
  },
} as const;

function won(n: number, lang: SeoLang, rates?: KrwRates): string {
  const code = langToCurrency(lang);
  const local = code ? krwTo(n, code, rates) : null;
  return local ? `${formatWon(n)} (≈ ${local})` : formatWon(n);
}

function AltCards({ alts, lang, rates }: { alts: AltClub[]; lang: SeoLang; rates?: KrwRates }) {
  const t = T[lang];
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {alts.map((a) => (
        <li key={a.id} className="rounded-xl bg-muted/40 border border-border p-3 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <Link href={a.href} data-nf-track="alt_club_details" className="text-[14px] font-black text-foreground hover:text-brand-amber leading-tight">
              {a.name}
            </Link>
            {a.rating != null && (
              <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Star className="w-3 h-3 fill-current text-brand-amber" />{a.rating.toFixed(1)}
                {a.reviewCount ? <span>· {a.reviewCount.toLocaleString()} {t.reviews}</span> : null}
              </span>
            )}
          </div>
          <p className="text-[13px] font-bold text-brand-amber tabular-nums">
            {t.altFrom ? `${t.altFrom} ` : ""}{won(a.from!, lang, rates)}{t.altFrom ? "" : "~"}
          </p>
          <div className="flex gap-2 mt-auto">
            <Link href={a.bookHref} data-nf-track="alt_club_book"
              className="flex-1 text-center py-2 rounded-lg bg-amber-500 text-black text-[12px] font-black hover:bg-amber-400">
              {t.altBook}
            </Link>
            <Link href={a.href} data-nf-track="alt_club_details"
              className="px-3 py-2 rounded-lg bg-muted border border-border text-[12px] font-bold text-foreground hover:text-brand-amber">
              {t.altDetails}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ClubBookingSection({
  lang, name, areaLabel, areaKo, areaSlug, bookable, pricing, tableChargeWeekday, tableChargeWeekend,
  bookHref, alternatives, rates,
}: Props) {
  const t = T[lang];
  const from = bookable ? tableFrom(areaKo, pricing) : null;
  const alts = alternatives.filter((a) => a.from != null).slice(0, 4);
  const compareHref = `/${lang}/clubs/${areaSlug}#table-prices`;

  if (bookable && from != null) {
    const floor = bookingFloor(areaKo);
    const lowestBase = pricing?.lowestSet ?? pricing?.lowestItem ?? null;
    // 최저 항목이 하한보다 싸면 "최저소비"로, 아니면 그냥 "테이블 가격"으로 부른다.
    const anchoredByFloor = lowestBase != null && lowestBase < floor;
    const reach = itemsToReachFloor(areaKo, pricing);
    const rows = (pricing?.topSets?.length ? pricing.topSets : pricing?.topItems) ?? [];
    const rowsTitle = pricing?.topSets?.length ? t.setsTitle : t.itemsTitle;
    const chargeText = [
      tableChargeWeekday ? `${t.chargeWd} ${formatWon(tableChargeWeekday)}` : null,
      tableChargeWeekend ? `${t.chargeWe} ${formatWon(tableChargeWeekend)}` : null,
    ].filter(Boolean).join(" · ");

    return (
      <section className="rounded-2xl bg-card border border-border p-5 space-y-4">
        <div>
          <h2 className="text-[18px] font-black">{t.h2(name)}</h2>
          <p className="text-[12px] font-bold text-muted-foreground mt-2">
            {anchoredByFloor ? t.minSpend(areaLabel) : t.tablesFrom}
          </p>
          <p className="text-[22px] font-black text-brand-amber tabular-nums leading-tight">
            {won(from, lang, rates)}
          </p>
          {anchoredByFloor && lowestBase != null && (
            <p className="text-[13px] text-muted-foreground mt-1.5 break-keep">{t.menuFrom(formatWon(lowestBase), reach)}</p>
          )}
        </div>

        {rows.length > 0 && (
          <div>
            <h3 className="text-[12px] font-bold text-muted-foreground mb-1.5">{rowsTitle}</h3>
            <table className="w-full text-[13px]">
              <tbody>
                {rows.map((s, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-2 text-foreground">
                      {s.name}{s.label ? <span className="text-muted-foreground"> · {s.label}</span> : null}
                    </td>
                    <td className="py-1.5 text-right font-black tabular-nums whitespace-nowrap">{formatWon(s.price)}</td>
                  </tr>
                ))}
                {chargeText && (
                  <tr>
                    <td className="py-1.5 pr-2 text-muted-foreground">{t.charge}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums whitespace-nowrap">{chargeText}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <ol className="space-y-1.5">
          {t.steps.map((s, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] text-foreground leading-relaxed break-keep">
              <span className="shrink-0 w-5 h-5 rounded-full bg-brand-amber text-black text-[11px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {t.trust.map((s) => (
            <li key={s} className="text-[12px] text-muted-foreground before:content-['✓'] before:text-brand-amber before:mr-1">{s}</li>
          ))}
        </ul>

        <Link href={bookHref} data-nf-track="book_cta_inline"
          className="block w-full text-center py-3 rounded-xl bg-amber-500 text-black font-black text-[14px] hover:bg-amber-400 transition-colors">
          {t.cta(name)} · {formatWon(from)}~
        </Link>

        {alts.length > 0 && (
          <div className="pt-3 border-t border-border">
            <h3 className="text-[13px] font-black text-foreground mb-2">{t.moreH3(areaLabel)}</h3>
            <AltCards alts={alts} lang={lang} rates={rates} />
            <Link href={compareHref} data-nf-track="see_area_prices" className="inline-block mt-2 text-[12px] text-brand-amber underline underline-offset-2">
              {t.seeAll(areaLabel)} →
            </Link>
          </div>
        )}
      </section>
    );
  }

  // 예약 불가 — 같은 지역에서 지금 잡을 수 있는 클럽을 가격과 함께.
  return (
    <section className="rounded-2xl bg-card border border-border p-5 space-y-3">
      <h2 className="text-[18px] font-black">{t.notH2(name)}</h2>
      <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">{t.notP(name, areaLabel, alts.length)}</p>
      {alts.length > 0 && <AltCards alts={alts} lang={lang} rates={rates} />}
      <Link href={compareHref} data-nf-track="see_area_prices" className="inline-block text-[13px] text-brand-amber underline underline-offset-2">
        {t.seeAll(areaLabel)} →
      </Link>
    </section>
  );
}
