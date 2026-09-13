import Link from "next/link";
import type { ClubPriceSummary } from "@/lib/clubs/tablePricing";
import { tableFrom, formatWon } from "@/lib/clubs/tablePricing";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";
import { krwTo, langToCurrency, type KrwRates } from "@/lib/utils/currency";

// 지역 페이지(/{lang}/clubs/{area})의 "테이블 가격 비교"(서버 컴포넌트).
//
// 왜(2026-09-10 크리틱 1차): "itaewon bottle service price", "弘大 夜店 低消", "江南 クラブ
// テーブル料金"처럼 클럽명 없이 지역+가격으로 들어오는 검색을 받을 URL이 없었다.
// 지역 페이지에 예약 가능한 클럽 전부의 최저소비·최저 세트를 싣고 각 행에서 바로 예약으로
// 보낸다. 숫자는 클럽 상세와 같은 tablePricing 규칙이라 표↔상세↔폼이 일치한다.
//
// 레이아웃(크리틱 2차): <table min-w-520>은 390px 폰에서 Book 버튼이 가로 스크롤 뒤로
// 숨었다. 행마다 [이름·세트가 / 최저소비·Book] 2열 그리드로 바꿔 CTA가 항상 첫 화면에 있게.
// id="table-prices" — 클럽 상세의 "가격 비교" 링크와 히어로 앵커가 여기로 온다.

export type AreaPriceRow = {
  id: string;
  name: string;
  href: string;
  bookHref: string;
  areaKo: string;
  rating: number | null;
  reviewCount: number | null;
  pricing: ClubPriceSummary | null | undefined;
};

const T = {
  en: {
    h2: (a: string) => `${a} club table prices — minimum spend & cheapest sets`,
    intro: (a: string, n: number) => `Real menu prices for the ${n} ${a} clubs you can book through NightFlow. The minimum spend is per table; the set price is the cheapest item on each club's menu. No broker fee — you pay the club on the night.`,
    min: "Min. spend / table", set: "Cheapest set", item: "Cheapest bottle", book: "Book", reviews: "reviews",
    note: "Weekday menu prices in KRW; weekend prices can be higher. Updated from each club's menu.",
  },
  ja: {
    h2: (a: string) => `${a}クラブのテーブル料金 — 最低予約金額と最安セット`,
    intro: (a: string, n: number) => `NightFlowで予約できる${a}のクラブ${n}軒の実際のメニュー価格です。最低金額は1卓あたり、セット価格は各クラブのメニュー最安品。仲介手数料なし、お支払いは当日クラブで。`,
    min: "1卓 最低金額", set: "最安セット", item: "最安ボトル", book: "予約", reviews: "件",
    note: "平日メニュー価格（ウォン）。週末は高くなる場合があります。各クラブのメニューから更新。",
  },
  zh: {
    h2: (a: string) => `${a}夜店卡座价格 — 最低消费与最便宜套餐`,
    intro: (a: string, n: number) => `可通过 NightFlow 预订的${n}家${a}夜店真实酒单价格。最低消费按每桌计，套餐价为各夜店酒单上最便宜的项目。无中介费，当晚在夜店付款。`,
    min: "每桌最低消费", set: "最便宜套餐", item: "最便宜酒水", book: "预订", reviews: "条评价",
    note: "价格为平日酒单价格（韩元），周末可能更高。根据各夜店酒单更新。",
  },
  "zh-tw": {
    h2: (a: string) => `${a}夜店包廂價格 — 低消與最便宜套餐`,
    intro: (a: string, n: number) => `可透過 NightFlow 訂包廂的${n}家${a}夜店真實酒單價格。低消按每桌計,套餐價為各夜店酒單上最便宜的項目。無中介費,當晚在夜店付款。`,
    min: "每桌低消", set: "最便宜套餐", item: "最便宜酒水", book: "訂包廂", reviews: "則評論",
    note: "價格為平日酒單價格(韓元),週末可能更高。依各夜店酒單更新。",
  },
} as const;

function local(n: number, lang: SeoLang, rates?: KrwRates): string | null {
  const code = langToCurrency(lang);
  return code ? krwTo(n, code, rates) : null;
}

export function AreaTablePrices({
  lang, areaLabel, rows, rates,
}: { lang: SeoLang; areaLabel: string; rows: AreaPriceRow[]; rates?: KrwRates }) {
  const t = T[lang];
  const list = rows
    .map((r) => ({ ...r, from: tableFrom(r.areaKo, r.pricing) }))
    .filter((r): r is typeof r & { from: number } => r.from != null)
    // 최저소비가 같으면(지역 하한이 대부분) 리뷰 수가 많은 순 — 별점 5.0/리뷰 1건이 위로 오지 않게
    .sort((a, b) => a.from - b.from || (b.reviewCount ?? 0) - (a.reviewCount ?? 0) || (b.rating ?? 0) - (a.rating ?? 0));
  if (list.length === 0) return null;

  return (
    <section id="table-prices" className="max-w-lg lg:max-w-[1000px] mx-auto px-4 lg:px-8 pt-6 lg:pt-10 scroll-mt-20">
      <h2 className="text-[17px] font-black text-foreground mb-1.5">{t.h2(areaLabel)}</h2>
      <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mb-3">{t.intro(areaLabel, list.length)}</p>
      <ul className="rounded-2xl border border-border bg-card divide-y divide-border">
        {list.map((r) => {
          const cheapest = r.pricing?.lowestSet ?? r.pricing?.lowestItem ?? null;
          const cheapestLabel = r.pricing?.lowestSet != null ? t.set : t.item;
          const fx = local(r.from, lang, rates);
          return (
            <li key={r.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center px-3 py-2.5">
              <div className="min-w-0">
                <Link href={r.href} data-nf-track="area_price_details" className="text-[14px] font-black text-foreground hover:text-brand-amber">{r.name}</Link>
                {r.rating != null && (
                  <span className="ml-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                    ★ {r.rating.toFixed(1)}{r.reviewCount ? ` · ${r.reviewCount.toLocaleString()} ${t.reviews}` : ""}
                  </span>
                )}
                <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                  {cheapest != null ? `${cheapestLabel} ${formatWon(cheapest)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-[10px] font-bold text-muted-foreground leading-none">{t.min}</p>
                  <p className="text-[14px] font-black tabular-nums leading-tight">{formatWon(r.from)}</p>
                  {fx && <p className="hidden sm:block text-[10px] text-muted-foreground tabular-nums">≈ {fx}</p>}
                </div>
                <Link href={r.bookHref} data-nf-track="area_price_book"
                  className="inline-block px-3 py-2 rounded-lg bg-amber-500 text-black text-[12px] font-black hover:bg-amber-400 whitespace-nowrap">
                  {t.book}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground mt-2">{t.note}</p>
    </section>
  );
}
