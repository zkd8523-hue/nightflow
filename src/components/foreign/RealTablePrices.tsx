import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchMenuClubIds, isBookable } from "@/lib/clubs/bookable";
import {
  fetchTablePricing, tableFrom, bookingFloor, formatWon, representativeItems,
  type ClubPriceSummary, type MenuSetSummary,
} from "@/lib/clubs/tablePricing";
import { clubSlug, canonicalAreaSlug } from "@/lib/clubs/slug";
import { getKrwRates, krwTo, langToCurrency } from "@/lib/utils/currency";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";

// /{lang}/vip-tables 의 "실제 메뉴 가격" 표(서버 컴포넌트).
//
// 왜(2026-09-10 채널 실측): AI 답변·검색의 가격 질의가 경쟁 블로그에 밀렸다. 그쪽은
// "Fountain ₩189,000 세트(보틀1+토닉3+치즈)"처럼 클럽명·세트명·금액·구성물을 한 줄에
// 쓰는데, 이 페이지엔 "강남 75~150만원" 범위만 있었다. 범위는 누구나 쓸 수 있어 인용되지
// 않는다. 나플은 실제 메뉴(club_menu_items.description 포함)를 갖고 있으므로 그대로 낸다.
//
// ⚠️ 두 숫자를 절대 섞지 말 것(크리틱 1차 최대 지적):
//   · 예약 하한(bookingFloor) = 1탁 최저소비. 이 페이지가 파는 것. 이태원/홍대 50만, 강남 100만.
//   · 메뉴 최저가(세트/단품) = 그 하한을 채우는 재료. ₩40,000짜리도 있다.
// "테이블 얼마부터?"의 답은 항상 하한이다. 메뉴 최저가를 답으로 쓰면 폼에서 12배 가격
// 쇼크가 나고, AggregateOffer에 넣으면 표시가·실제가 불일치로 리치결과 제재 대상이 된다.
//
// ⚠️ 세트(category=set)와 단품을 라벨로 구분한다. 예전엔 단품 한 병을 "Cheapest set"이라
// 불러 거짓 진술이었다.

type PriceRow = {
  id: string;
  name: string;
  area: string;
  areaLabel: string;
  href: string | null;   // 그 언어의 클럽 상세가 없으면 null — 한국어 페이지로 보내지 않는다
  bookHref: string;
  /** 1탁 최저소비(지역 하한 적용) — 이 페이지가 파는 가격 */
  from: number;
  /** 메뉴 최저 항목 */
  cheapest: MenuSetSummary | null;
  /** 그 항목이 세트인가(아니면 단품 한 병) */
  cheapestIsSet: boolean;
  tableChargeWeekday: number | null;
  tableChargeWeekend: number | null;
  rating: number | null;
  reviewCount: number | null;
};

const AREA_LABEL: Record<SeoLang, Record<string, string>> = {
  en: { "이태원": "Itaewon", "홍대": "Hongdae", "강남": "Gangnam" },
  ja: { "이태원": "梨泰院", "홍대": "弘大", "강남": "江南" },
  zh: { "이태원": "梨泰院", "홍대": "弘大", "강남": "江南" },
  "zh-tw": { "이태원": "梨泰院", "홍대": "弘大", "강남": "江南" },
};
// 이 페이지는 "Seoul" 제목·title을 쓴다 — 부산·대구·광주를 섞으면 제목이 거짓이 된다(크리틱 1차).
const SEOUL_AREAS = ["이태원", "홍대", "강남"];
// 평점이 낮은데 표본까지 적으면 그대로 노출하는 게 손님·클럽 양쪽에 손해다.
const HIDE_RATING_BELOW = 3.0;

const T = {
  en: {
    h2: "What a table actually costs — real menu prices",
    intro: (n: number) =>
      `NightFlow can book ${n} Seoul clubs right now. A table is booked against a minimum spend for the whole group — ₩500,000 in Itaewon and Hongdae, ₩1,000,000 in Gangnam — and you fill that with items from the club's own menu. Below is each club's cheapest menu item so you can see what your money buys. These are the clubs' own prices; NightFlow adds no fee.`,
    minSpend: "Minimum spend per table",
    fromLabel: "From",
    andUp: " and up",
    set: "Cheapest set", item: "Cheapest bottle", book: "Book",
    charge: "table charge", reviews: "reviews",
    note: "Weekday menu prices in KRW, taken from each club's own menu. Weekend prices can be higher and some clubs add a table charge, shown above where it applies.",
    faqH2: "Seoul club table price — questions people actually ask",
    jump: "Jump to",
  },
  ja: {
    h2: "テーブルの実際の料金 — メニュー実価格",
    intro: (n: number) =>
      `NightFlowが今すぐ予約できるソウルのクラブは${n}軒です。テーブルはグループ1卓あたりの最低金額（梨泰院・弘大は50万ウォン、江南は100万ウォン）で予約し、その金額をクラブのメニューから選んで埋めます。下は各クラブのメニュー最安品で、その金額で何が飲めるかが分かります。クラブ自身の価格で、NightFlowの手数料はありません。`,
    minSpend: "1卓あたり最低金額",
    fromLabel: "この店の開始金額",
    andUp: "〜",
    set: "最安セット", item: "最安ボトル", book: "予約",
    charge: "テーブルチャージ", reviews: "件のクチコミ",
    note: "平日のメニュー価格（ウォン）で、各クラブのメニューから取得しています。週末は高くなる場合があり、テーブルチャージがあるクラブは上に表示しています。",
    faqH2: "ソウルのクラブ テーブル料金 — よくある質問",
    jump: "エリアへ",
  },
  zh: {
    h2: "卡座实际要花多少 — 酒单真实价格",
    intro: (n: number) =>
      `NightFlow 现在可预订${n}家首尔夜店。卡座按每桌整组的最低消费预订（梨泰院·弘大 50万韩元，江南 100万韩元），这个金额由您从夜店酒单中选酒来凑满。下面是各夜店酒单上最便宜的项目，让您看清这笔钱能买到什么。这些是夜店自己的价格，NightFlow 不加收费用。`,
    minSpend: "每桌最低消费",
    fromLabel: "该店起价",
    andUp: "起",
    set: "最便宜套餐", item: "最便宜单瓶", book: "预订",
    charge: "台费", reviews: "条评价",
    note: "平日酒单价格（韩元），取自各夜店酒单。周末可能更高，有台费的夜店已在上方标注。",
    faqH2: "首尔夜店卡座价格 — 常见问题",
    jump: "跳至",
  },
  "zh-tw": {
    h2: "包廂實際要花多少 — 酒單真實價格",
    intro: (n: number) =>
      `NightFlow 現在可訂包廂的首爾夜店有${n}家。包廂（舞池旁的開放式桌位，不是密閉房間）按每桌整組的低消預訂（梨泰院、弘大 50萬韓元，江南 100萬韓元），這個金額由您從夜店酒單中選酒湊滿。下面是各夜店酒單上最便宜的項目，讓您看清這筆錢能買到什麼。這些是夜店自己的價格，NightFlow 不加收費用。`,
    minSpend: "每桌低消",
    fromLabel: "該店起價",
    andUp: "起",
    set: "最便宜套餐", item: "最便宜單瓶", book: "訂包廂",
    charge: "包廂費", reviews: "則評論",
    note: "平日酒單價格（韓元），取自各夜店酒單。週末可能更高，有包廂費的夜店已在上方標註。",
    faqH2: "首爾夜店包廂價格 — 常見問題",
    jump: "跳至",
  },
} as const;

/** 표·JSON-LD·FAQ가 같은 값을 쓰도록 한 번만 조회한다. */
export async function fetchRealTablePrices(lang: SeoLang): Promise<PriceRow[]> {
  const supabase = await createClient();
  const [clubsRes, menuIds] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, name_en, area, google_rating, google_review_count, table_charge_weekday, table_charge_weekend, foreign_booking_agreed, partners:club_partners(md_id)")
      .is("deleted_at", null)
      .eq("status", "approved")
      .eq("is_test", false)
      .eq("hidden_from_guide", false)
      .in("area", SEOUL_AREAS),
    fetchMenuClubIds(supabase),
  ]);

  const bookables = (clubsRes.data ?? []).filter(
    (c) =>
      c.name_en?.trim() &&
      isBookable({ name: c.name, has_md: (c.partners?.length ?? 0) > 0, agreed: !!c.foreign_booking_agreed, has_menu: menuIds.has(c.id) }),
  );
  if (bookables.length === 0) return [];

  // ⚠️ 클럽×메뉴가 1,000행 상한을 넘을 수 있어 12곳씩 끊는다. 청크는 서로 독립이라 병렬로.
  const chunks = await Promise.all(
    Array.from({ length: Math.ceil(bookables.length / 12) }, (_, i) =>
      fetchTablePricing(supabase, bookables.slice(i * 12, i * 12 + 12).map((c) => c.id)),
    ),
  );
  const pricing = new Map<string, ClubPriceSummary>();
  for (const chunk of chunks) for (const [k, v] of chunk) pricing.set(k, v);

  const rows: PriceRow[] = [];
  for (const c of bookables) {
    const p = pricing.get(c.id);
    const from = tableFrom(c.area, p);
    if (from == null) continue;
    const areaSlug = canonicalAreaSlug(c.area);
    const nameEn = c.name_en!.trim();
    // 하한의 20% 미만인 저가 항목(Dawn ₩40,000 코로나 세트 등)은 테이블 예약의
    // 대표 가격이 아니라 오해만 부르므로 후보에서 뺀다(2026-09-10).
    const set = representativeItems(c.area, p?.topSets)[0] ?? null;
    const item = representativeItems(c.area, p?.topItems)[0] ?? null;
    // 세트가 더 비싸도 세트를 우선 보여준다 — "얼마에 뭘 마시나"의 답은 세트 쪽이 낫다.
    const cheapest = set ?? item;
    rows.push({
      id: c.id,
      name: nameEn,
      area: c.area,
      areaLabel: AREA_LABEL[lang][c.area] ?? c.area,
      href: areaSlug ? `/${lang}/clubs/${areaSlug}/${clubSlug(nameEn)}` : null,
      bookHref: `/flags/new?lang=${lang}&area=${encodeURIComponent(c.area)}&club=${c.id}`,
      from,
      cheapest,
      cheapestIsSet: !!set,
      tableChargeWeekday: c.table_charge_weekday,
      tableChargeWeekend: c.table_charge_weekend,
      rating: c.google_rating,
      reviewCount: c.google_review_count,
    });
  }
  // 지역은 검색량 순(강남·홍대·이태원), 지역 안에서는 메뉴 최저가 싼 순.
  const AREA_ORDER = ["강남", "홍대", "이태원"];
  return rows.sort(
    (a, b) =>
      AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area) ||
      (a.cheapest?.price ?? a.from) - (b.cheapest?.price ?? b.from),
  );
}

function groupByArea(rows: PriceRow[]) {
  const m = new Map<string, PriceRow[]>();
  for (const r of rows) {
    const l = m.get(r.area) ?? [];
    l.push(r);
    m.set(r.area, l);
  }
  return m;
}

export async function RealTablePrices({ lang, rows }: { lang: SeoLang; rows: PriceRow[] }) {
  const t = T[lang];
  if (rows.length === 0) return null;
  const rates = (await getKrwRates()).rates;
  const code = langToCurrency(lang);
  const byArea = groupByArea(rows);
  const local = (n: number) => (code ? krwTo(n, code, rates) : null);

  return (
    <section id="table-prices" className="space-y-4 scroll-mt-20">
      <h2 className="text-[20px] font-black">{t.h2}</h2>
      <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">{t.intro(rows.length)}</p>

      {/* 지역 앵커 — 강남이 검색량 1위인데 스크롤 끝에 있으면 안 된다 */}
      <nav className="flex flex-wrap gap-2 text-[12px]">
        <span className="text-muted-foreground">{t.jump}</span>
        {[...byArea.keys()].map((area) => (
          <a key={area} href={`#tp-${canonicalAreaSlug(area) ?? area}`}
            className="px-2.5 py-1 rounded-full bg-muted border border-border font-bold hover:text-brand-amber">
            {AREA_LABEL[lang][area] ?? area}
          </a>
        ))}
      </nav>

      {[...byArea.entries()].map(([area, list]) => {
        const floor = bookingFloor(area);
        const fx = local(floor);
        return (
          <div key={area} id={`tp-${canonicalAreaSlug(area) ?? area}`} className="space-y-1.5 scroll-mt-20">
            <h3 className="text-[14px] font-black text-foreground pt-2">
              {AREA_LABEL[lang][area] ?? area}
              <span className="ml-2 text-[11px] font-medium text-muted-foreground">
                {t.minSpend}{" "}
                {`${formatWon(floor)}${list.some((r) => r.from > floor) ? t.andUp : ""}`}
                {fx ? ` (≈ ${fx})` : ""}
              </span>
            </h3>
            <ul className="rounded-2xl border border-border bg-card divide-y divide-border">
              {list.map((r) => {
                const showRating =
                  r.rating != null && !(r.rating < HIDE_RATING_BELOW && (r.reviewCount ?? 0) >= 10);
                const charge = [r.tableChargeWeekday, r.tableChargeWeekend].filter(Boolean) as number[];
                return (
                  <li key={r.id} className="grid grid-cols-[1fr_auto] gap-x-3 items-center px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        {r.href ? (
                          <Link href={r.href} data-nf-track="vip_price_details" className="text-[14px] font-black text-foreground hover:text-brand-amber">
                            {r.name}
                          </Link>
                        ) : (
                          <span className="text-[14px] font-black text-foreground">{r.name}</span>
                        )}
                        {showRating && (
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            ★ {r.rating!.toFixed(1)}
                            {r.reviewCount ? ` · ${r.reviewCount.toLocaleString()} ${t.reviews}` : ""}
                          </span>
                        )}
                        {charge.length > 0 && (
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            + {t.charge} {formatWon(Math.min(...charge))}
                          </span>
                        )}
                        {/* AI·검색이 인용하는 단위는 "행"이다 — 지역과 최저소비가 행 안에 없으면
                            잘라 붙였을 때 뜻이 깨진다(크리틱 2차). */}
                        {/* 지역·금액을 행 안에 둔다(AI 인용 단위). 화면에는 h3에 이미 있어
                            중복이므로 sr-only — 인용 가능성은 유지하고 모바일 밀도는 낮춘다. */}
                        <span className="sr-only" aria-hidden="true">
                          · {r.areaLabel} · {r.from > bookingFloor(r.area) ? t.fromLabel : t.minSpend}{" "}
                          {formatWon(r.from)}
                        </span>
                      </div>
                      {r.cheapest && (
                        <p className="text-[12px] text-muted-foreground mt-0.5 break-keep">
                          {r.cheapestIsSet ? t.set : t.item}{" "}
                          <span className="text-foreground font-bold tabular-nums">{formatWon(r.cheapest.price)}</span>
                          {" · "}
                          <span className="line-clamp-2">
                            {r.cheapest.name}
                            {r.cheapest.description ? ` — ${r.cheapest.description}` : r.cheapest.label ? ` (${r.cheapest.label})` : ""}
                          </span>
                          {/* 하한의 1/4도 안 되는 항목은 개수를 같이 적는다 — Dawn ₩40,000 옆에
                              최저소비 ₩500,000만 있으면 12배 차이가 오해를 부른다(크리틱 2차). */}
                          {r.cheapest.price * 4 < r.from && (
                            <span className="whitespace-nowrap">
                              {" "}(×{Math.ceil(r.from / r.cheapest.price)} → {formatWon(r.from)})
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <Link href={r.bookHref} data-nf-track="vip_price_book"
                      className="px-3 py-2 rounded-lg bg-amber-500 text-black text-[12px] font-black hover:bg-amber-400 whitespace-nowrap">
                      {t.book}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <p className="text-[11px] text-muted-foreground">{t.note}</p>
    </section>
  );
}

/**
 * 표와 같은 값의 JSON-LD.
 * ⚠️ 가격은 전부 `from`(1탁 최저소비) — 이 페이지가 파는 것이 그것이다. 메뉴 최저가(₩40,000)를
 * Offer.price에 넣으면 표시가와 실제 결제 하한이 달라 리치결과 제재 대상이 된다(크리틱 1차).
 * 메뉴 항목은 Offer.description에 예시로만 싣는다.
 */
export function realTablePricesJsonLd(rows: PriceRow[], lang: SeoLang, pageUrl: string) {
  if (rows.length === 0) return null;
  const floors = rows.map((r) => r.from);
  return {
    "@type": "ItemList",
    "@id": `${pageUrl}#table-prices`,
    name: T[lang].h2,
    numberOfItems: rows.length,
    itemListElement: rows.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "NightClub",
        name: r.name,
        ...(r.href ? { url: `https://nightflow.kr${r.href}` } : {}),
        address: { "@type": "PostalAddress", addressLocality: r.areaLabel, addressRegion: "Seoul", addressCountry: "KR" },
        makesOffer: {
          "@type": "Offer",
          name: `${r.name} table booking`,
          priceCurrency: "KRW",
          price: r.from,
          // 화면 라벨과 같은 논리 — 클럽 최저세트가 지역 하한보다 비싸면 "최저소비"가 아니라
          // "이 클럽 시작가"다. 구조화 데이터에서만 다르게 말하면 AI가 모순을 인용한다(크리틱 4차).
          description: (() => {
            const floor = bookingFloor(r.area);
            const head =
              r.from > floor
                ? `From ${formatWon(r.from)} per table (${r.areaLabel} minimum spend is ${formatWon(floor)}; this club's cheapest set is above it).`
                : `Minimum spend ${formatWon(r.from)} per table.`;
            return r.cheapest
              ? `${head} Cheapest menu item: ${r.cheapest.name} ${formatWon(r.cheapest.price)}${r.cheapest.description ? ` (${r.cheapest.description})` : ""}.`
              : head;
          })(),
          availability: "https://schema.org/InStock",
          url: `https://nightflow.kr${r.bookHref}`,
        },
      },
    })),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "KRW",
      lowPrice: Math.min(...floors),
      highPrice: Math.max(...floors),
      offerCount: rows.length,
    },
  };
}

/** 가격 질의에 직접 답하는 FAQ — 항상 "하한이 답"으로 시작한다. */
export function realTablePricesFaqs(rows: PriceRow[], lang: SeoLang): { q: string; a: string }[] {
  if (rows.length === 0) return [];
  const byArea = groupByArea(rows);
  const areas = [...byArea.entries()].map(([area, list]) => ({
    area,
    label: list[0].areaLabel,
    floor: bookingFloor(area),
    list,
  }));
  // 예시로 쓸 세트 — 하한을 두세 개로 채울 수 있는 현실적인 항목
  const setRows = rows.filter((r) => r.cheapestIsSet && r.cheapest);
  const ex = setRows.find((r) => (r.cheapest!.price ?? 0) >= r.from / 3) ?? setRows[0] ?? rows[0];
  const exPrice = ex.cheapest ? formatWon(ex.cheapest.price) : formatWon(ex.from);
  const exCount = ex.cheapest ? Math.max(2, Math.ceil(ex.from / ex.cheapest.price)) : 2;

  const floorsEn = areas.map((a) => `${a.label} ${formatWon(a.floor)}`).join(", ");
  const floorsCjk = areas.map((a) => `${a.label} ${formatWon(a.floor)}`).join("、");

  if (lang === "ja") {
    return [
      {
        q: "ソウルのクラブでテーブルはいくらからですか？",
        a: `1卓あたりの最低金額は${floorsCjk}です（1人あたりではなくテーブル全体の金額）。この金額をクラブのメニューから選んで埋めます。例えば${ex.name}の${ex.cheapest?.name ?? "セット"}は${exPrice}なので、${exCount}点ほどで最低金額に届きます。NightFlowの手数料はなく、お支払いは当日クラブで直接です。`,
      },
      {
        q: "テーブル料金には何が含まれますか？",
        a: ex.cheapest?.description
          ? `セットの内容はクラブのメニューどおりです。例：${ex.name}の${ex.cheapest.name}（${exPrice}）は「${ex.cheapest.description}」。表示価格はクラブ自身の価格で、仲介手数料はありません。クラブによっては別途テーブルチャージがかかります。`
          : `セットにはボトルとミキサーが含まれ、内容はクラブのメニューどおりです（例：${ex.name}の${ex.cheapest?.name ?? "セット"} ${exPrice}）。表示価格はクラブ自身の価格で、仲介手数料はありません。`,
      },
    ];
  }
  if (lang === "zh") {
    return [
      {
        q: "首尔夜店卡座最低多少钱？",
        a: `每桌最低消费为${floorsCjk}（是整桌金额，不是人均）。这个金额由您从夜店酒单中选酒凑满。例如${ex.name}的${ex.cheapest?.name ?? "套餐"}为${exPrice}，点${exCount}项左右即可达到最低消费。NightFlow 不收中介费，当晚在夜店直接付款。`,
      },
      {
        q: "卡座价格包含什么？",
        a: ex.cheapest?.description
          ? `套餐内容以夜店酒单为准。例如${ex.name}的${ex.cheapest.name}（${exPrice}）包含「${ex.cheapest.description}」。显示价格就是夜店自己的价格，无中介费。部分夜店另收台费。`
          : `套餐包含酒水和饮料，内容以夜店酒单为准（例如${ex.name}的${ex.cheapest?.name ?? "套餐"} ${exPrice}）。显示价格就是夜店自己的价格，无中介费。`,
      },
    ];
  }
  if (lang === "zh-tw") {
    return [
      {
        q: "首爾夜店包廂最低多少錢？",
        a: `每桌低消為${floorsCjk}（是整桌金額，不是每人）。這個金額由您從夜店酒單中選酒湊滿。例如${ex.name}的${ex.cheapest?.name ?? "套餐"}為${exPrice}，點${exCount}項左右即可達到低消。NightFlow 不收中介費，當晚在夜店直接付款。`,
      },
      {
        q: "包廂價格包含什麼？",
        a: ex.cheapest?.description
          ? `套餐內容以夜店酒單為準。例如${ex.name}的${ex.cheapest.name}（${exPrice}）包含「${ex.cheapest.description}」。顯示價格就是夜店自己的價格，無中介費。部分夜店另收包廂費。`
          : `套餐包含酒水和飲料，內容以夜店酒單為準（例如${ex.name}的${ex.cheapest?.name ?? "套餐"} ${exPrice}）。顯示價格就是夜店自己的價格，無中介費。`,
      },
      {
        // 대만 어휘 包廂은 KTV처럼 밀폐 룸으로도 읽혀서, 도착 후 "룸인 줄 알았다"가 안 나오게 여기서 못 박는다.
        q: "包廂是密閉的房間嗎？",
        a: "不是。韓國夜店的包廂是舞池旁的開放式桌位，有沙發和自己的桌子，可以看到整個舞池。想要密閉房間的話，多數首爾夜店沒有這種選項。",
      },
    ];
  }
  return [
    {
      q: "How much is a table at a Seoul club?",
      a: `The minimum spend is ${floorsEn} — that is for the whole table, not per person. You fill it with items from the club's own menu: ${ex.name}'s ${ex.cheapest?.name ?? "set"} is ${exPrice}, so about ${exCount} of them reaches the minimum. NightFlow charges no fee and you pay the club directly on the night.`,
    },
    {
      q: "What do you actually get for a Seoul club table?",
      a: ex.cheapest?.description
        ? `Sets are exactly as listed on the club's menu — for example ${ex.name}'s ${ex.cheapest.name} at ${exPrice} is "${ex.cheapest.description}". The price shown is the club's own price with no broker fee; some clubs add a separate table charge.`
        : `Each set includes bottles and mixers exactly as listed on the club's own menu (for example ${ex.name}'s ${ex.cheapest?.name ?? "set"} at ${exPrice}). The price shown is the club's own price with no broker fee.`,
    },
  ];
}
