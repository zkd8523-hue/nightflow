import Link from "next/link";
import { Star } from "lucide-react";
import type { ClubPriceSummary } from "@/lib/clubs/tablePricing";
import { formatWon, clubFloor, CLUB_MIN_SPEND_OVERRIDE, representativeItems } from "@/lib/clubs/tablePricing";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";
import type { KrwRates } from "@/lib/utils/currency";
import { approxLocal, displayItem } from "@/lib/foreign/premiumMenu";

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
  clubId?: string;
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
  /** 그 언어로 옮긴 영업시간 문구(translateClubMeta) — 요약 문장용 */
  hours?: string | null;
  /** 영업 요일(0=일). hours가 없을 때만 요약 문장에 쓴다 */
  openDows?: number[] | null;
};


const T = {
  en: {
    h2: (n: string) => `Book a table at ${n}`,
    minSpend: (a: string) => `Minimum spend per table (${a})`,
    define: "",
    tablesFrom: "Tables from",
    setsTitle: "Starting sets",
    itemsTitle: "Starting bottles",
    charge: "Table charge",
    chargeWd: "weekday",
    chargeWe: "weekend",
    steps: ["Pick your date, group size and bottles from the club's menu.", "We confirm everything with the club in Korean.", "You get the final price in writing. Pay the club on the night."],
    cta: () => `Request a table`,
    onMenu: (names: string) => `On the menu: ${names}`,
    trustLine: "Final price confirmed in writing before the night · Pay the club directly",
    howItWorks: "How booking works",
    allFrom: (p: string) => `All from ${p}`,
    moreH3: (a: string) => `Other ${a} clubs you can book`,
    notH2: (_n: string, a: string) => `Tables in ${a} we can arrange`,
    notP: (n: string, a: string, k: number) => k > 0 ? `We can't arrange ${n} yet — these ${a} clubs we can.` : `We don't handle tables at ${n} yet. See which Seoul clubs we can book for you right now.`,
    altFrom: "from",
    altBook: "Request",
    altDetails: "Details",
    reviews: "reviews",
    seeAll: (a: string) => `Compare all ${a} table prices`,
    summary: (n: string, a: string, price: string, when: string | null) =>
      `${n} is a club in ${a}. Tables start at ${price} per table, filled from the club's printed menu.${when ? ` ${when}.` : ""} Foreign visitors can book it in English through NightFlow: send your date and group size, get the final price in writing before the night, and pay the club on the night.`,
    hoursLine: (h: string) => `Hours: ${h}`,
    daysLine: (d: string) => `Open ${d}`,
    dows: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    daily: "daily",
  },
  ja: {
    h2: (n: string) => `${n}のテーブル予約`,
    minSpend: (a: string) => `1卓あたり最低予約金額（${a}）`,
    define: "",
    tablesFrom: "テーブル料金",
    setsTitle: "メニューのセット",
    itemsTitle: "メニューのボトル",
    charge: "テーブルチャージ",
    chargeWd: "平日",
    chargeWe: "週末",
    steps: ["日程・人数を選び、クラブのメニューからボトルを選択。", "NightFlowがクラブに韓国語で確認。", "最終金額を文面でお知らせ。当日クラブでお支払い。"],
    cta: () => `テーブルをリクエスト`,
    onMenu: (names: string) => `メニュー：${names}`,
    trustLine: "最終金額は当日前に書面で確定 · お支払いはクラブへ直接",
    howItWorks: "予約の流れ",
    allFrom: (p: string) => `すべて${p}〜`,
    moreH3: (a: string) => `${a}で予約できる他のクラブ`,
    notH2: (_n: string, a: string) => `${a}で手配できるテーブル`,
    notP: (n: string, a: string, k: number) => k > 0 ? `${n}はまだお取り扱いしていません。` : `${n}のテーブルはまだお取り扱いしていません。今すぐ予約できるクラブをご覧ください。`,
    altFrom: "",
    altBook: "リクエスト",
    altDetails: "詳細",
    reviews: "件",
    seeAll: (a: string) => `${a}のテーブル料金をすべて比較`,
    summary: (n: string, a: string, price: string, when: string | null) =>
      `${n}は${a}のクラブです。テーブルは1卓${price}から、クラブの実際のメニューで組みます。${when ? `${when}。` : ""}NightFlowなら日本語で予約できます — 日程と人数を送ると、当日前に最終金額を文面でお知らせし、お支払いは当日クラブで。`,
    hoursLine: (h: string) => `営業時間：${h}`,
    daysLine: (d: string) => `営業日：${d}`,
    dows: ["日", "月", "火", "水", "木", "金", "土"],
    daily: "毎日",
  },
  zh: {
    h2: (n: string) => `预订${n}的卡座`,
    minSpend: (a: string) => `每桌最低消费（${a}）`,
    define: "",
    tablesFrom: "卡座价格",
    setsTitle: "入门套餐",
    itemsTitle: "入门酒水",
    charge: "台费",
    chargeWd: "平日",
    chargeWe: "周末",
    steps: ["选择日期、人数，从夜店酒单选酒。", "我们用韩语向夜店确认所有细节。", "书面告知最终价格。当晚在夜店付款。"],
    cta: () => `申请卡座`,
    onMenu: (names: string) => `酒单：${names}`,
    trustLine: "当晚前书面确认最终价格 · 直接向夜店付款",
    howItWorks: "预订流程",
    allFrom: (p: string) => `均 ${p} 起`,
    moreH3: (a: string) => `${a}其他可预订的夜店`,
    notH2: (_n: string, a: string) => `${a}可为您安排的卡座`,
    notP: (n: string, a: string, k: number) => k > 0 ? `${n}暂不可安排。` : `我们目前还不能代订${n}的卡座。看看现在可以预订的夜店。`,
    altFrom: "",
    altBook: "申请",
    altDetails: "详情",
    reviews: "条评价",
    seeAll: (a: string) => `比较${a}全部卡座价格`,
    summary: (n: string, a: string, price: string, when: string | null) =>
      `${n}是${a}的夜店。卡座每桌${price}起，按夜店实际酒单组合。${when ? `${when}。` : ""}通过NightFlow可以用中文预订：发来日期和人数，到店前以书面确认最终价格，当晚在夜店付款。`,
    hoursLine: (h: string) => `营业时间：${h}`,
    daysLine: (d: string) => `营业日：${d}`,
    dows: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    daily: "每天",
  },
  "zh-tw": {
    h2: (n: string) => `在${n}訂包廂`,
    minSpend: (a: string) => `每桌低消(${a})`,
    // 包廂=오픈 부스임을 첫 등장에서 한 번 정의(룸으로 오해 방지). 대만 어휘 근거는 clubBookingSeo.ts 상단.
    define: "包廂是舞池旁的開放式桌位(有沙發和自己的桌子),不是密閉房間。",
    tablesFrom: "包廂價格",
    setsTitle: "入門套餐",
    itemsTitle: "入門酒水",
    charge: "包廂費",
    chargeWd: "平日",
    chargeWe: "週末",
    steps: ["選擇日期、人數,從夜店酒單選酒。", "我們用韓語向夜店確認所有細節。", "書面告知最終價格。當晚在夜店付款。"],
    cta: () => `申請包廂`,
    onMenu: (names: string) => `酒單：${names}`,
    trustLine: "當晚前書面確認最終價格 · 直接向夜店付款",
    howItWorks: "訂位流程",
    allFrom: (p: string) => `皆 ${p} 起`,
    moreH3: (a: string) => `${a}其他可訂包廂的夜店`,
    notH2: (_n: string, a: string) => `${a}可為您安排的包廂`,
    notP: (n: string, a: string, k: number) => k > 0 ? `${n}暫不可安排。` : `我們目前還不能代訂${n}的包廂。看看現在可以訂包廂的夜店。`,
    altFrom: "",
    altBook: "申請",
    altDetails: "詳情",
    reviews: "則評論",
    seeAll: (a: string) => `比較${a}全部包廂價格`,
    summary: (n: string, a: string, price: string, when: string | null) =>
      `${n}是${a}的夜店。包廂每桌${price}起，依夜店實際酒單組合。${when ? `${when}。` : ""}透過NightFlow可以用中文訂位：傳來日期和人數，到店前以書面確認最終價格，當晚在夜店付款。`,
    hoursLine: (h: string) => `營業時間：${h}`,
    daysLine: (d: string) => `營業日：${d}`,
    dows: ["週日", "週一", "週二", "週三", "週四", "週五", "週六"],
    daily: "每天",
  },
} as const;

// 손님 통화를 먼저(유효숫자 2자리 "≈ US$1,000"), 원화는 작게 — 외화 끝자리(US$1,049)는 계산기처럼 보인다(2026-10-24 하이엔드 점검).
function localFirst(n: number, lang: SeoLang, rates?: KrwRates): string | null {
  return rates ? approxLocal(n, lang, rates) : null;
}
/** 문장 안에 넣는 금액 — "₩1,400,000 (≈ US$1,000)" */
function wonInline(n: number, lang: SeoLang, rates?: KrwRates): string {
  const l = localFirst(n, lang, rates);
  return l ? `${formatWon(n)} (${l})` : formatWon(n);
}

// 별점이 낮은 클럽을 "대신 여기" 카드에 별과 함께 띄우면 오히려 망설이게 한다 — 4.0 미만은 별을 숨긴다.
const MIN_SHOWN_RATING = 4;

function AltCards({ alts, lang, rates, hidePrice = false }: { alts: AltClub[]; lang: SeoLang; rates?: KrwRates; hidePrice?: boolean }) {
  const t = T[lang];
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {alts.map((a) => (
        <li key={a.id} className="rounded-xl bg-muted/40 border border-border p-3 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <Link href={a.href} data-nf-track="alt_club_details" className="text-[14px] font-black text-foreground hover:text-brand-amber leading-tight">
              {a.name}
            </Link>
            {a.rating != null && a.rating >= MIN_SHOWN_RATING && (
              <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Star className="w-3 h-3 fill-current text-brand-amber" />{a.rating.toFixed(1)}
                {a.reviewCount ? <span>· {a.reviewCount.toLocaleString()} {t.reviews}</span> : null}
              </span>
            )}
          </div>
          {!hidePrice && (
          <p className="text-[13px] font-bold text-brand-amber tabular-nums">
            {t.altFrom ? `${t.altFrom} ` : ""}{localFirst(a.from!, lang, rates) ?? formatWon(a.from!)}{t.altFrom ? "" : "~"}
            {localFirst(a.from!, lang, rates) && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{formatWon(a.from!)}</span>}
          </p>
          )}
          <div className="flex gap-2 mt-auto">
            <Link rel="nofollow" href={a.bookHref} data-nf-track="alt_club_book"
              className="flex-1 text-center py-2 rounded-lg border border-amber-500/70 text-brand-amber text-[12px] font-black hover:bg-amber-500/10">
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
  lang, clubId, name, areaLabel, areaKo, areaSlug, bookable, pricing, tableChargeWeekday, tableChargeWeekend,
  bookHref, alternatives, rates, hours, openDows,
}: Props) {
  const t = T[lang];
  const floorOverride = clubId ? CLUB_MIN_SPEND_OVERRIDE[clubId] : undefined;
  const floor = clubFloor(clubId, areaKo);
  const lowestBaseForFrom = pricing?.lowestSet ?? pricing?.lowestItem ?? null;
  const from = bookable ? (lowestBaseForFrom != null ? Math.max(floor, lowestBaseForFrom) : null) : null;
  const alts = alternatives.filter((a) => a.from != null).slice(0, 4);
  const compareHref = `/${lang}/clubs/${areaSlug}#table-prices`;
  const sameAltFrom = alts.length > 1 && alts.every((a) => a.from === alts[0].from);

  if (bookable && from != null) {
    const lowestBase = pricing?.lowestSet ?? pricing?.lowestItem ?? null;
    // 최저 항목이 하한보다 싸면 "최저소비"로, 아니면 그냥 "테이블 가격"으로 부른다.
    const anchoredByFloor = lowestBase != null && lowestBase < floor;
    // 하한의 20% 미만 저가 항목은 테이블 예약 대표가가 아니라 제외(2026-09-10).
    // 3개까지만 — 이건 요약이고 전체 메뉴는 폼에서 본다.
    const repMin = floor * 0.2;
    const repSets = (floorOverride != null
      ? (pricing?.topSets ?? []).filter((i) => i.price >= repMin)
      : representativeItems(areaKo, pricing?.topSets)
    ).slice(0, 3);
    const repItems = (floorOverride != null
      ? (pricing?.topItems ?? []).filter((i) => i.price >= repMin)
      : representativeItems(areaKo, pricing?.topItems)
    ).slice(0, 3);
    const rows = repSets.length ? repSets : repItems;
    const rowsTitle = repSets.length ? t.setsTitle : t.itemsTitle;
    const dowsText = openDows && openDows.length
      ? openDows.length === 7 ? t.daily : [...openDows].sort((a, b) => a - b).map((d) => t.dows[d]).join("·")
      : null;
    const whenLine = hours ? t.hoursLine(hours) : dowsText ? t.daysLine(dowsText) : null;
    const chargeText = [
      tableChargeWeekday ? `${t.chargeWd} ${formatWon(tableChargeWeekday)}` : null,
      tableChargeWeekend ? `${t.chargeWe} ${formatWon(tableChargeWeekend)}` : null,
    ].filter(Boolean).join(" · ");

    return (
      <section className="rounded-2xl bg-card border border-border p-5 space-y-4">
        {/* 2026-10-24 간소화(운영자: "텍스트가 너무 많다, 아무도 다 읽고 예약하지 않는다").
            같은 말이 반복됐다 — 가격 8번, "서면 확정" 3번, "보증금 없음·현장 결제" 2번, "메뉴로 채움" 4번.
            보이는 건 가격·병 시작가·안심 한 줄·버튼만. 요약 문장(AI 인용용, 2026-10-20)·3단계·병 표는
            "예약 방법" 접힘 안으로 — 접혀 있어도 HTML에 그대로 있어 검색엔진·AI는 계속 읽는다. */}
        <div>
          <h2 className="text-[18px] font-black">{t.h2(name)}</h2>
          <p className="text-[12px] font-bold text-muted-foreground mt-2">
            {anchoredByFloor ? t.minSpend(areaLabel) : t.tablesFrom}
          </p>
          <p className="text-[24px] font-black text-brand-amber tabular-nums leading-tight">
            {localFirst(from, lang, rates) ?? formatWon(from)}
            {localFirst(from, lang, rates) && <span className="ml-2 text-[13px] font-bold text-muted-foreground">{formatWon(from)}</span>}
          </p>
          {/* 병 시작가(₩350,000)는 뺐다 — 140만원 테이블 바로 밑에서 기준가처럼 읽혔다. 금액은 접힘 안 표에. */}
          {rows.length > 0 && (
            <p className="text-[13px] text-muted-foreground mt-1.5 break-keep">
              {t.onMenu(rows.map((r) => displayItem(r.name)).join(" · "))}
            </p>
          )}
          {chargeText && (
            <p className="text-[12px] text-muted-foreground mt-1 break-keep">{t.charge}: {chargeText}</p>
          )}
        </div>

        <Link rel="nofollow" href={bookHref} data-nf-track="book_cta_inline"
          className="block w-full text-center py-3 rounded-xl bg-amber-500 text-black font-black text-[14px] hover:bg-amber-400 transition-colors">
          {t.cta()}
        </Link>
        <p className="text-[12px] text-muted-foreground text-center -mt-2 break-keep">{t.trustLine}</p>

        <details className="group rounded-xl border border-border">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[13px] font-bold text-foreground flex items-center justify-between">
            {t.howItWorks}
            <span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="px-3.5 pb-3.5 space-y-3">
            <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">
              {t.summary(name, areaLabel, wonInline(from, lang, rates), whenLine)}
            </p>
            <ol className="space-y-1.5">
              {t.steps.map((st, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] text-foreground leading-relaxed break-keep">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-brand-amber text-black text-[11px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span>{st}</span>
                </li>
              ))}
            </ol>
            {rows.length > 0 && (
              <div>
                <h3 className="text-[12px] font-bold text-muted-foreground mb-1.5">{rowsTitle}</h3>
                <table className="w-full text-[13px]">
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="py-1.5 pr-2 text-foreground">
                          {displayItem(r.name)}{r.label ? <span className="text-muted-foreground"> · {r.label}</span> : null}
                        </td>
                        <td className="py-1.5 text-right font-black tabular-nums whitespace-nowrap">{formatWon(r.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>

        {alts.length > 0 && (
          <div className="pt-3 border-t border-border">
            {/* 대안 카드 가격이 전부 같으면(강남은 모두 지역 하한) 카드마다 반복하지 않고 제목 옆에 한 번만. */}
            <h3 className="text-[13px] font-black text-foreground mb-2">
              {t.moreH3(areaLabel)}
              {sameAltFrom && <span className="ml-1.5 text-[12px] font-bold text-brand-amber">· {t.allFrom(localFirst(alts[0].from!, lang, rates) ?? formatWon(alts[0].from!))}</span>}
            </h3>
            <AltCards alts={alts} lang={lang} rates={rates} hidePrice={sameAltFrom} />
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
      {alts.length > 0 && <h2 className="text-[18px] font-black">{t.notH2(name, areaLabel)}</h2>}
      <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">{t.notP(name, areaLabel, alts.length)}</p>
      {alts.length > 0 && <AltCards alts={alts} lang={lang} rates={rates} />}
      <Link href={compareHref} data-nf-track="see_area_prices" className="inline-block text-[13px] text-brand-amber underline underline-offset-2">
        {t.seeAll(areaLabel)} →
      </Link>
    </section>
  );
}
