// 외국어 하이엔드 페이지(2026-10-24) — 병 가격(/{lang}/bottle-prices/{brand})과 강남 테이블 예산(/{lang}/gangnam-table-budget).
// ⚠️ VIP·VVIP 표현 금지(운영자 2026-10-24) — 기본 테이블을 VIP라 부르면 오해. 메뉴판 항목명 인용만.
//
// UX 원칙(운영자 지적 2026-10-24: "SEO만 신경 쓰고 UX는 전혀"):
//   - 첫 화면에 그 페이지 질문의 답(숫자 하나, 손님 통화 먼저) + 예약 버튼. 하단 고정 버튼도 둔다.
//   - 한 페이지 = 한 질문. 병은 브랜드마다 따로, 상단 칩으로 서로 이동.
//   - 목록은 짧게(기본 6줄, 나머지는 접힘). 긴 설명·FAQ는 맨 아래 접힘 — HTML엔 그대로 있어 검색·AI가 읽는다.
//   - 금액은 손님 통화 먼저, 원화는 작게("₩3M은 한국에서나 삼백만원").
// 데이터는 실제 메뉴(lib/foreign/premiumMenu). 클럽 상세·예약 폼은 건드리지 않는다.

import Link from "next/link";
import type { Metadata } from "next";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { StickyReveal } from "@/components/foreign/StickyReveal";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";
import { formatWon, bookingFloor } from "@/lib/clubs/tablePricing";
import { getKrwRates, formatAsOfLocale, type KrwRates } from "@/lib/utils/currency";
import { fetchPremiumMenu, isSingleBottle, approxLocal, approxRange, displayLabel, AREA_LABEL, type PremiumRow } from "@/lib/foreign/premiumMenu";

const BASE = "https://nightflow.kr";
const OG_LOCALE: Record<SeoLang, string> = { en: "en_US", ja: "ja_JP", zh: "zh_CN", "zh-tw": "zh_TW" };
const IN_LANG: Record<SeoLang, string> = { en: "en", ja: "ja", zh: "zh-CN", "zh-tw": "zh-TW" };

function alternates(path: string) {
  return {
    canonical: undefined as string | undefined,
    languages: {
      "en-US": `${BASE}/en${path}`,
      "zh-CN": `${BASE}/zh${path}`,
      "zh-TW": `${BASE}/zh-tw${path}`,
      "ja-JP": `${BASE}/ja${path}`,
      "x-default": `${BASE}/en${path}`,
    },
  };
}

// ── 공통 UI ──────────────────────────────────────────────────────────────

/** 하단 고정 예약 버튼 — 어디까지 내려도 예약이 한 번에 닿게. */
function StickyCta({ href, label }: { href: string; label: string }) {
  return (
    <StickyReveal watchId="book-cta">
      <div className="border-t border-border bg-background/95 backdrop-blur px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <Link rel="nofollow" href={href} data-nf-track="book_cta_sticky"
            className="block w-full text-center py-3.5 rounded-xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400">
            {label}
          </Link>
        </div>
      </div>
    </StickyReveal>
  );
}

function PriceRowLine({ r, lang, rates }: { r: PremiumRow; lang: SeoLang; rates: KrwRates }) {
  const body = (
    <>
      <span className="min-w-0">
        <span className="block text-[14px] font-bold text-foreground truncate">{r.club}</span>
        {/* 잘라내지 않는다(2줄까지) — "25 + …"처럼 구성이 잘리면 무엇을 사는지 모른다. */}
        <span className="block text-[11px] text-muted-foreground leading-snug line-clamp-2">{AREA_LABEL[lang][r.area] ?? r.area} · {r.item}{displayLabel(r.label, lang) ? ` · ${displayLabel(r.label, lang)}` : ""}</span>
      </span>
      <span className="text-right shrink-0">
        <span className="block text-[14px] font-black tabular-nums">{approxLocal(r.price, lang, rates)}</span>
        <span className="block text-[11px] text-muted-foreground tabular-nums">{formatWon(r.price)}</span>
      </span>
    </>
  );
  const cls = "flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0";
  return <li>{r.href ? <Link href={r.href} className={`${cls} hover:bg-muted/30`}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}

function FaqFold({ title, faqs }: { title: string; faqs: { q: string; a: string }[] }) {
  return (
    <details className="group rounded-2xl border border-border">
      <summary className="cursor-pointer list-none px-4 py-3 text-[14px] font-bold flex items-center justify-between">
        {title}<span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="px-4 pb-4 space-y-3">
        {faqs.map((f) => (
          <div key={f.q}>
            <h3 className="text-[13px] font-bold text-foreground break-keep">{f.q}</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mt-0.5">{f.a}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function jsonLd(url: string, name: string, lang: SeoLang, crumb: string, faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#page`, url, name, inLanguage: IN_LANG[lang] },
      { "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: `${BASE}/${lang}` },
          { "@type": "ListItem", position: 2, name: crumb, item: url },
        ],
      },
    ],
  };
}

// ── 병 가격 페이지 ────────────────────────────────────────────────────────

export const BOTTLE_BRANDS = ["armand-de-brignac", "dom-perignon", "louis-xiii"] as const;
export type BottleBrand = (typeof BOTTLE_BRANDS)[number];

const BRAND: Record<BottleBrand, { rx: RegExp; name: Record<SeoLang, string>; chip: Record<SeoLang, string> }> = {
  "armand-de-brignac": {
    rx: /armand/i,
    name: { en: "Armand de Brignac (Ace of Spades)", ja: "アルマンド（アルマン・ド・ブリニャック）", zh: "黑桃A（Armand de Brignac）", "zh-tw": "黑桃A（Armand de Brignac）" },
    chip: { en: "Ace of Spades", ja: "アルマンド", zh: "黑桃A", "zh-tw": "黑桃A" },
  },
  "dom-perignon": {
    rx: /dom.?p[eé]rignon/i,
    name: { en: "Dom Pérignon", ja: "ドンペリ（ドン・ペリニヨン）", zh: "香槟王（Dom Pérignon）", "zh-tw": "香檳王（Dom Pérignon）" },
    chip: { en: "Dom Pérignon", ja: "ドンペリ", zh: "香槟王", "zh-tw": "香檳王" },
  },
  "louis-xiii": {
    rx: /louis\s*xiii/i,
    name: { en: "Louis XIII cognac", ja: "ルイ13世", zh: "路易十三", "zh-tw": "路易十三" },
    chip: { en: "Louis XIII", ja: "ルイ13世", zh: "路易十三", "zh-tw": "路易十三" },
  },
};

const BT = {
  en: {
    title: (b: string) => `How Much Is ${b} at a Seoul Club? Real Menu Prices (2026)`,
    desc: (b: string) => `What a bottle of ${b} costs at the Seoul clubs we book — real menu prices, club by club, in your currency. Final price confirmed in writing before you go.`,
    h1: (b: string) => `How much is ${b} at a Seoul club?`,
    perBottle: "a bottle",
    sub: (n: number, krw: string) => `${krw} · ${n} clubs · weekday menu prices`,
    cta: "Book a table",
    ctaSub: "Final price confirmed in writing before you go",
    listH2: "By club",
    more: (n: number) => `Show ${n} more`,
    rate: (d: string) => `Your-currency amounts are approximate (rate of ${d}). Clubs charge in won — card or cash.`,
    faqH2: "Questions",
    faq: (b: string, n: number, krw: string, local: string) => [
      { q: `How much is ${b} at a Seoul club?`, a: `At the ${n} Seoul clubs we book, a bottle of ${b} is ${krw} (${local}) on the club's own menu, weekday price.` },
      { q: "Does it count toward the table minimum?", a: "Yes. What you order fills your table's minimum spend. NightFlow adds nothing on top." },
      { q: "Can I order it with my table booking?", a: "Yes — pick it in the booking form or just send your budget. We check it with the club and confirm the final price in writing before the night. No deposit." },
    ],
    crumb: (b: string) => `${b} price`,
  },
  ja: {
    title: (b: string) => `ソウルのクラブで${b}はいくら？実際のメニュー価格 (2026)`,
    desc: (b: string) => `ソウルの予約可能なクラブで${b}が1本いくらか — 実際のメニュー価格をクラブ別に、円で。最終金額はご来店前に書面で確定。`,
    h1: (b: string) => `ソウルのクラブで${b}はいくら？`,
    perBottle: "1本",
    sub: (n: number, krw: string) => `${krw} · ${n}軒 · 平日メニュー価格`,
    cta: "テーブルを予約",
    ctaSub: "最終金額はご来店前に書面で確定",
    listH2: "クラブ別",
    more: (n: number) => `残り${n}軒を表示`,
    rate: (d: string) => `円は目安です（${d}のレート）。支払いはウォン（カード・現金可）。`,
    faqH2: "よくある質問",
    faq: (b: string, n: number, krw: string, local: string) => [
      { q: `ソウルのクラブで${b}はいくら？`, a: `予約可能なソウルのクラブ${n}軒で、${b}は1本${krw}（${local}）です（各クラブのメニュー、平日価格）。` },
      { q: "テーブルの最低金額に含まれますか？", a: "はい。注文したボトルがテーブルの最低金額に充てられます。NightFlowの手数料はかかりません。" },
      { q: "テーブル予約と一緒に注文できますか？", a: "はい。予約フォームで選ぶか、予算だけ伝えてください。クラブに確認のうえ、最終金額を当日までに書面でお知らせします。デポジット不要です。" },
    ],
    crumb: (b: string) => `${b}の値段`,
  },
  zh: {
    title: (b: string) => `首尔夜店${b}多少钱？真实酒单价格（2026）`,
    desc: (b: string) => `首尔可预订夜店里${b}一瓶多少钱 — 各夜店真实酒单价格，人民币显示。到店前书面确认最终价格。`,
    h1: (b: string) => `首尔夜店${b}多少钱？`,
    perBottle: "一瓶",
    sub: (n: number, krw: string) => `${krw} · ${n} 家夜店 · 平日酒单价`,
    cta: "预订卡座",
    ctaSub: "到店前书面确认最终价格",
    listH2: "各夜店价格",
    more: (n: number) => `显示其余 ${n} 家`,
    rate: (d: string) => `人民币为估算（${d}汇率）。夜店以韩元收费，可刷卡或付现。`,
    faqH2: "常见问题",
    faq: (b: string, n: number, krw: string, local: string) => [
      { q: `首尔夜店${b}多少钱？`, a: `在我们可预订的 ${n} 家首尔夜店，${b}一瓶 ${krw}（${local}），为各夜店酒单平日价。` },
      { q: "算在卡座最低消费里吗？", a: "算。点的酒直接抵卡座最低消费，NightFlow 不另收费。" },
      { q: "可以和卡座一起预订吗？", a: "可以。在预订表单里选，或只告诉我们预算。我们向夜店确认后，在当晚前书面确认最终价格，无需订金。" },
    ],
    crumb: (b: string) => `${b}价格`,
  },
  "zh-tw": {
    title: (b: string) => `首爾夜店${b}多少錢？真實酒單價格（2026）`,
    desc: (b: string) => `首爾可訂夜店裡${b}一瓶多少錢 — 各夜店真實酒單價格，台幣顯示。到店前書面確認最終價格。`,
    h1: (b: string) => `首爾夜店${b}多少錢？`,
    perBottle: "一瓶",
    sub: (n: number, krw: string) => `${krw} · ${n} 家夜店 · 平日酒單價`,
    cta: "訂包廂",
    ctaSub: "到店前書面確認最終價格",
    listH2: "各夜店價格",
    more: (n: number) => `顯示其餘 ${n} 家`,
    rate: (d: string) => `台幣為估算（${d}匯率）。夜店以韓元收費，可刷卡或付現。`,
    faqH2: "常見問題",
    faq: (b: string, n: number, krw: string, local: string) => [
      { q: `首爾夜店${b}多少錢？`, a: `在我們可訂的 ${n} 家首爾夜店，${b}一瓶 ${krw}（${local}），為各夜店酒單平日價。` },
      { q: "算在包廂低消裡嗎？", a: "算。點的酒直接抵包廂低消，NightFlow 不另收費。" },
      { q: "可以和包廂一起預訂嗎？", a: "可以。在訂位表單裡選，或只告訴我們預算。我們向夜店確認後，在當晚前書面確認最終價格，免訂金。" },
    ],
    crumb: (b: string) => `${b}價格`,
  },
} as const;

export function bottlePriceMetadata(brand: BottleBrand, lang: SeoLang): Metadata {
  const b = BRAND[brand].name[lang];
  const c = BT[lang];
  const path = `/bottle-prices/${brand}`;
  const url = `${BASE}/${lang}${path}`;
  const alt = alternates(path);
  return {
    title: { absolute: c.title(b) },
    description: c.desc(b),
    alternates: { canonical: url, languages: alt.languages },
    openGraph: { title: c.title(b), description: c.desc(b), url, locale: OG_LOCALE[lang], type: "website" },
  };
}

export async function BottlePricePage({ brand, lang }: { brand: BottleBrand; lang: SeoLang }) {
  const c = BT[lang];
  const def = BRAND[brand];
  const b = def.name[lang];
  const [all, fx] = await Promise.all([fetchPremiumMenu(lang), getKrwRates()]);
  const rates = fx.rates;
  // 클럽마다 그 브랜드의 가장 싼 1병만 — 같은 클럽이 여러 줄 나오면 비교가 안 된다.
  const perClub = new Map<string, PremiumRow>();
  for (const r of all.filter((r) => def.rx.test(r.item) && isSingleBottle(r)).sort((x, y) => x.price - y.price)) {
    if (!perClub.has(r.clubId)) perClub.set(r.clubId, r);
  }
  // 강남 먼저 — 이 페이지를 찾는 손님의 기준은 강남 테이블이다. 지역 안에서는 싼 순.
  const AREA_ORDER = ["강남", "홍대", "이태원"];
  const rows = [...perClub.values()].sort((x, y) => AREA_ORDER.indexOf(x.area) - AREA_ORDER.indexOf(y.area) || x.price - y.price);
  const url = `${BASE}/${lang}/bottle-prices/${brand}`;
  const bookHref = `/flags/new?lang=${lang}`;
  const min = rows.reduce((m, r) => Math.min(m, r.price), rows[0]?.price ?? 0);
  const max = rows.reduce((m, r) => Math.max(m, r.price), 0);
  const krw = min === max ? formatWon(min) : `${formatWon(min)}–${formatWon(max)}`;
  const local = rows.length ? approxRange(min, max, lang, rates) : "";
  const faqs = rows.length ? c.faq(b, rows.length, krw, local) : [];
  const head = rows.slice(0, 6);
  const rest = rows.slice(6);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ForeignPageTracker kind="info" lang={lang} meta={{ page: `bottle-prices/${brand}` }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(url, c.title(b), lang, c.crumb(b), faqs)) }} />
      <div className="max-w-2xl mx-auto px-5 pt-10 pb-32 space-y-6">
        <nav className="flex gap-2 overflow-x-auto -mx-1 px-1" aria-label="bottles">
          {BOTTLE_BRANDS.map((k) => (
            <Link key={k} href={`/${lang}/bottle-prices/${k}`} aria-current={k === brand ? "page" : undefined}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-bold border ${k === brand ? "bg-amber-500 text-black border-amber-500" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
              {BRAND[k].chip[lang]}
            </Link>
          ))}
        </nav>

        {/* 첫 화면 = 질문·답·버튼 */}
        <header className="space-y-3">
          <h1 className="text-[26px] font-black tracking-tight leading-tight break-keep">{c.h1(b)}</h1>
          {rows.length > 0 && (
            <div>
              <p className="text-[30px] font-black text-brand-amber tabular-nums leading-tight">{local} <span className="text-[15px] font-bold text-muted-foreground">{c.perBottle}</span></p>
              <p className="text-[12px] text-muted-foreground mt-1">{c.sub(rows.length, krw)}</p>
            </div>
          )}
          <Link id="book-cta" rel="nofollow" href={bookHref} data-nf-track="book_cta"
            className="block w-full text-center py-3.5 rounded-xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400">
            {c.cta}
          </Link>
          <p className="text-[12px] text-muted-foreground text-center">{c.ctaSub}</p>
        </header>

        {rows.length > 0 && (
          <section>
            <h2 className="text-[16px] font-black mb-1">{c.listH2}</h2>
            <ul>{head.map((r) => <PriceRowLine key={r.clubId} r={r} lang={lang} rates={rates} />)}</ul>
            {rest.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer list-none py-2.5 text-[13px] font-bold text-brand-amber">{c.more(rest.length)} ▾</summary>
                <ul>{rest.map((r) => <PriceRowLine key={r.clubId} r={r} lang={lang} rates={rates} />)}</ul>
              </details>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">{c.rate(formatAsOfLocale(fx.asOfIso, lang))}</p>
          </section>
        )}

        {faqs.length > 0 && <FaqFold title={c.faqH2} faqs={faqs} />}
      </div>
      <StickyCta href={bookHref} label={c.cta} />
    </div>
  );
}

// ── 강남 테이블 예산 페이지 ─────────────────────────────────────────────────────

const VVIP_SLUG = "gangnam-table-budget";
// 폼의 강남 예산 단계(1.4M·3M·10M + 30M·50M·100M)와 같은 금액대
const TIERS = [3_000_000, 10_000_000, 30_000_000, 50_000_000, 100_000_000];

const VT = {
  en: {
    title: "How Much Is a Gangnam Club Table? From the Minimum to the Top of the Menu (2026)",
    desc: "What a table costs at the Gangnam clubs we book — the minimum per table, and what bigger budgets buy on the real menus, in your currency.",
    h1: "How much is a Gangnam club table?",
    perTable: "per table, minimum",
    sub: (krw: string, maxLocal: string) => `${krw} · the top of the menus is ${maxLocal}`,
    cta: "Book a table",
    ctaSub: "Final price confirmed in writing before you go",
    chipsH2: "What a bigger budget gets you",
    rate: (d: string) => `Your-currency amounts are approximate (rate of ${d}). Clubs charge in won — card or cash.`,
    faqH2: "Questions",
    faq: (floorKrw: string, floorLocal: string, maxKrw: string, maxLocal: string) => [
      { q: "How much is a table at a Gangnam club?", a: `At the Gangnam clubs we book, a table starts at ${floorKrw} (${floorLocal}), filled from the club's own menu. The top of those menus is ${maxKrw} (${maxLocal}).` },
      { q: "Is the price per person?", a: "No — it's per table." },
      { q: "Do I pay a deposit?", a: "No. The final price is confirmed in writing before the night and you pay the club on the night." },
    ],
    crumb: "Gangnam table prices",
  },
  ja: {
    title: "江南クラブのテーブル料金 — 最低金額からメニュー最上位まで (2026)",
    desc: "江南の予約可能なクラブでテーブルはいくらか — 1テーブルの最低金額と、予算を上げると実際のメニューで何が頼めるかを円で。",
    h1: "江南クラブのテーブルはいくら？",
    perTable: "1テーブル・最低金額",
    sub: (krw: string, maxLocal: string) => `${krw} · メニュー最上位は${maxLocal}`,
    cta: "テーブルを予約",
    ctaSub: "最終金額はご来店前に書面で確定",
    chipsH2: "予算を上げると何が頼める？",
    rate: (d: string) => `円は目安です（${d}のレート）。支払いはウォン（カード・現金可）。`,
    faqH2: "よくある質問",
    faq: (floorKrw: string, floorLocal: string, maxKrw: string, maxLocal: string) => [
      { q: "江南クラブのテーブルはいくら？", a: `予約可能な江南のクラブでは1テーブル${floorKrw}（${floorLocal}）から、クラブのメニューで最低金額を満たします。メニューの最上位は${maxKrw}（${maxLocal}）です。` },
      { q: "料金は1人あたりですか？", a: "いいえ、1テーブルあたりの金額です。" },
      { q: "デポジットは必要ですか？", a: "不要です。最終金額は当日までに書面でお知らせし、当日クラブでお支払いいただきます。" },
    ],
    crumb: "江南テーブル料金",
  },
  zh: {
    title: "首尔江南夜店卡座多少钱？从低消到酒单最高档（2026）",
    desc: "江南可预订夜店的卡座多少钱 — 每桌最低消费，以及预算更高时真实酒单能点什么，人民币显示。",
    h1: "江南夜店卡座多少钱？",
    perTable: "每桌最低消费",
    sub: (krw: string, maxLocal: string) => `${krw} · 酒单最高档 ${maxLocal}`,
    cta: "预订卡座",
    ctaSub: "到店前书面确认最终价格",
    chipsH2: "预算更高能点什么？",
    rate: (d: string) => `人民币为估算（${d}汇率）。夜店以韩元收费，可刷卡或付现。`,
    faqH2: "常见问题",
    faq: (floorKrw: string, floorLocal: string, maxKrw: string, maxLocal: string) => [
      { q: "江南夜店卡座多少钱？", a: `我们可预订的江南夜店，每桌 ${floorKrw}（${floorLocal}）起，以酒水消费抵低消。酒单上最高档的是 ${maxKrw}（${maxLocal}）。` },
      { q: "价格是每人吗？", a: "不是，是每桌的价格。" },
      { q: "要付订金吗？", a: "不用。最终价格会在当晚前书面确认，当晚在夜店付款。" },
    ],
    crumb: "江南卡座价格",
  },
  "zh-tw": {
    title: "首爾江南夜店包廂多少錢？從低消到酒單最高檔（2026）",
    desc: "江南可訂夜店的包廂多少錢 — 每桌低消，以及預算更高時真實酒單能點什麼，台幣顯示。",
    h1: "江南夜店包廂多少錢？",
    perTable: "每桌低消",
    sub: (krw: string, maxLocal: string) => `${krw} · 酒單最高檔 ${maxLocal}`,
    cta: "訂包廂",
    ctaSub: "到店前書面確認最終價格",
    chipsH2: "預算更高能點什麼？",
    rate: (d: string) => `台幣為估算（${d}匯率）。夜店以韓元收費，可刷卡或付現。`,
    faqH2: "常見問題",
    faq: (floorKrw: string, floorLocal: string, maxKrw: string, maxLocal: string) => [
      { q: "江南夜店包廂多少錢？", a: `我們可訂的江南夜店，每桌低消 ${floorKrw}（${floorLocal}）起，以酒水消費抵低消。酒單上最高檔的是 ${maxKrw}（${maxLocal}）。` },
      { q: "價格是每人嗎？", a: "不是，是每桌的價格。" },
      { q: "要付訂金嗎？", a: "不用。最終價格會在當晚前書面確認，當晚在夜店付款。" },
    ],
    crumb: "江南包廂價格",
  },
} as const;

export function gangnamTableBudgetMetadata(lang: SeoLang): Metadata {
  const c = VT[lang];
  const path = `/${VVIP_SLUG}`;
  const url = `${BASE}/${lang}${path}`;
  return {
    title: { absolute: c.title },
    description: c.desc,
    alternates: { canonical: url, languages: alternates(path).languages },
    openGraph: { title: c.title, description: c.desc, url, locale: OG_LOCALE[lang], type: "website" },
  };
}

export async function GangnamTableBudgetPage({ lang }: { lang: SeoLang }) {
  const c = VT[lang];
  const [all, fx] = await Promise.all([fetchPremiumMenu(lang, ["강남"]), getKrwRates()]);
  const rates = fx.rates;
  const floor = bookingFloor("강남");
  const top = all.reduce((m, r) => (r.price > m ? r.price : m), 0);
  // 금액대 대표 고르기(2026-10-24 하이엔드 점검 반영):
  //   - 샴페인·코냑·구성 세트가 먼저. 위스키·데킬라·보드카는 뒤, 10병 묶음 저가 샴페인(Deep Ice 등)은 뺀다.
  //   - 한 클럽은 전체에서 2칸까지 — 위쪽(항목이 드문) 금액대부터 채워서 큰 칸이 비지 않게.
  const rank = (r: PremiumRow) => (r.category === "champagne" || r.category === "cognac" || r.category === "set" ? 0 : 1);
  const BULK = /^(deep ice|sono|illumi|montelvini|mua|tina|cartes de cour)/i;
  // 병당 50만원 미만을 5병 이상 묶은 구성(모엣 10병 300만원 등)은 "더 큰 예산"의 예로 어울리지 않는다.
  const bottles = (r: PremiumRow) => Number(r.label?.match(/^(\d+)/)?.[1] ?? 1);
  const isBulk = (r: PremiumRow) => BULK.test(r.item) || (bottles(r) >= 5 && r.price / bottles(r) < 500_000);
  const used = new Map<string, number>();
  const tiers = [...TIERS].reverse().map((t) => {
    const pick: PremiumRow[] = [];
    const cands = all
      .filter((r) => r.price <= t && r.price >= t * 0.75 && !isBulk(r))
      .sort((a, b) => rank(a) - rank(b) || b.price - a.price);
    for (const r of cands) {
      if (pick.some((p) => p.clubId === r.clubId)) continue; // 한 금액대에 한 클럽 한 줄
      if ((used.get(r.clubId) ?? 0) >= 2) continue;
      pick.push(r);
      if (pick.length >= 3) break;
    }
    for (const p of pick) used.set(p.clubId, (used.get(p.clubId) ?? 0) + 1);
    return { t, pick };
  }).reverse().filter((x) => x.pick.length > 0);
  const url = `${BASE}/${lang}/${VVIP_SLUG}`;
  const bookHref = `/flags/new?lang=${lang}&area=${encodeURIComponent("강남")}`;
  const floorLocal = approxLocal(floor, lang, rates);
  const maxLocal = approxLocal(top, lang, rates);
  const faqs = c.faq(formatWon(floor), floorLocal, formatWon(top), maxLocal);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ForeignPageTracker kind="info" lang={lang} meta={{ page: VVIP_SLUG }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(url, c.title, lang, c.crumb, faqs)) }} />
      <div className="max-w-2xl mx-auto px-5 pt-10 pb-32 space-y-6">
        <header className="space-y-3">
          <h1 className="text-[26px] font-black tracking-tight leading-tight break-keep">{c.h1}</h1>
          <div>
            <p className="text-[30px] font-black text-brand-amber tabular-nums leading-tight">{floorLocal} <span className="text-[15px] font-bold text-muted-foreground">{c.perTable}</span></p>
            <p className="text-[12px] text-muted-foreground mt-1 break-keep">{c.sub(formatWon(floor), maxLocal)}</p>
          </div>
          <Link id="book-cta" rel="nofollow" href={bookHref} data-nf-track="book_cta"
            className="block w-full text-center py-3.5 rounded-xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400">
            {c.cta}
          </Link>
          <p className="text-[12px] text-muted-foreground text-center">{c.ctaSub}</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-[16px] font-black">{c.chipsH2}</h2>
          {/* 금액대 칩 — 눌러서 그 칸으로 바로 */}
          <nav className="flex gap-2 overflow-x-auto -mx-1 px-1" aria-label="budget">
            {tiers.map(({ t }) => (
              <a key={t} href={`#tier-${t}`} className="shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-bold border border-border bg-card hover:border-amber-500/60">
                {approxLocal(t, lang, rates, false)}
              </a>
            ))}
          </nav>
          {tiers.map(({ t, pick }) => (
            <div key={t} id={`tier-${t}`} className="scroll-mt-4 rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-[18px] font-black text-brand-amber tabular-nums">
                {approxLocal(t, lang, rates)} <span className="text-[12px] font-bold text-muted-foreground">{formatWon(t)}</span>
              </p>
              <ul>{pick.map((r, i) => <PriceRowLine key={`${r.clubId}-${i}`} r={r} lang={lang} rates={rates} />)}</ul>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">{c.rate(formatAsOfLocale(fx.asOfIso, lang))}</p>
        </section>

        <FaqFold title={c.faqH2} faqs={faqs} />
      </div>
      <StickyCta href={bookHref} label={c.cta} />
    </div>
  );
}
