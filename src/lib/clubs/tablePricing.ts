// 외국인 트랙 SEO·예약 콘텐츠용 "테이블 가격 요약".
//
// 배경(2026-09-10 해외 SEO 감사): 해외 자연유입의 대부분이 클럽 상세 페이지로 들어오는데,
// 페이지에 "테이블이 얼마부터인지"가 아예 없었다. 예약 의도 검색어("X table price",
// "X bottle service", "Xのテーブル料金", "X 桌位價格")는 가격이 있는 페이지가 이긴다.
// 메뉴판(club_menu_items·variants)은 이미 손님이 폼에서 담는 실데이터라, 여기서 요약해
// 본문·title·JSON-LD(Offer)에 같은 숫자를 싣는다 — 폼에서 보는 금액과 어긋나지 않는다.
//
// 규칙은 ForeignRequestForm의 카드 가격과 동일: "실제로 시작하는 금액" =
// max(지역 하한, 그 클럽의 최저 세트). 최저 세트가 없으면 최저 단품. 하한 미만 세트가
// 있어도 폼이 하한을 강제하므로(orderAmount < minBudget → 차단) 하한보다 낮게 적으면 거짓말.
//
// ⚠️ 하한 표는 ForeignRequestForm.tsx의 AREA_MIN_BUDGET와 값이 같아야 한다. 그쪽은
// 티어 3개짜리 표라 그대로 import 하기엔 결합이 세서 여기 최소값만 복제했다 — 바꿀 땐 둘 다.

export const FOREIGN_TABLE_FLOOR: Record<string, number> = {
  "강남": 1_000_000,
  "이태원": 500_000,
  "홍대": 500_000,
};
export const FOREIGN_TABLE_FLOOR_FALLBACK = 500_000;

export function bookingFloor(area: string | null | undefined): number {
  return (area && FOREIGN_TABLE_FLOOR[area]) || FOREIGN_TABLE_FLOOR_FALLBACK;
}

export type MenuSetSummary = {
  /** 항목 이름(영문). 없으면 한글명 */
  name: string;
  /** 구성물("1 bottle + 3 tonics + cheese platter") — 경쟁사가 인용되는 지점이라 노출한다 */
  description: string | null;
  /** "3 bottle set" 같은 변형 라벨(영문) — 없을 수 있음 */
  label: string | null;
  /** 평일가 */
  price: number;
};

export type ClubPriceSummary = {
  /** 가장 싼 세트(category=set, VVIP 제외) 평일가. 세트가 없으면 null */
  lowestSet: number | null;
  /** 가장 싼 단품 평일가 */
  lowestItem: number | null;
  /** 가장 비싼 항목 평일가 — AggregateOffer.highPrice용 */
  highest: number | null;
  setCount: number;
  itemCount: number;
  /** 싼 순 세트 최대 3개 — "X bottle price" 검색자가 원하는 실명·실가격 */
  topSets: MenuSetSummary[];
  /** 세트가 없는 클럽(강남 단품 위주)용 — 싼 순 단품 최대 3개 */
  topItems: MenuSetSummary[];
};

type MenuRow = {
  club_id: string;
  name_en: string | null;
  name_ko: string | null;
  description: string | null;
  category: string | null;
  is_vvip: boolean | null;
  variants: { label_en: string | null; price: number | null; price_weekend: number | null }[] | null;
};

// 서버/브라우저 클라이언트 모두 받는다 — bookable.ts의 MinimalClient와 같은 이유.
// 체인을 구조적 타입으로 정확히 적으면 supabase-js의 PostgrestFilterBuilder 제네릭과
// 대조하다 TS2589(과도한 타입 인스턴스화)가 난다(2026-09-10 실제 발생). 여기서 쓰는 건
// from().select().eq().in() 하나뿐이라 호출부만 느슨하게 받고 결과만 좁힌다.
type MinimalClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
};

/**
 * 여러 클럽의 가격 요약을 한 번에. 상세 페이지에서 "이 클럽 + 예약 가능한 이웃"을
 * 한 쿼리로 받는다(클럽당 쿼리하면 N+1).
 *
 * ⚠️ PostgREST 기본 상한 1,000행. 클럽 10곳 × 최대 74항목 ≈ 750행이라 한 페이지 안에서는
 * 안전하지만, 이 함수를 목록 전체(33곳)에 쓰면 잘린다 — 그땐 나눠 부를 것.
 */
export async function fetchTablePricing(
  supabase: MinimalClient,
  clubIds: string[],
): Promise<Map<string, ClubPriceSummary>> {
  const out = new Map<string, ClubPriceSummary>();
  const ids = Array.from(new Set(clubIds.filter(Boolean)));
  if (ids.length === 0) return out;

  const { data } = await supabase
    .from("club_menu_items")
    .select("club_id, name_en, name_ko, description, category, is_vvip, variants:club_menu_variants(label_en, price, price_weekend)")
    .eq("is_active", true)
    .in("club_id", ids);

  const rows = (data ?? []) as MenuRow[];
  const acc = new Map<string, { sets: MenuSetSummary[]; items: MenuSetSummary[]; prices: number[] }>();
  for (const r of rows) {
    const variants = (r.variants ?? []).filter(
      (v): v is { label_en: string | null; price: number; price_weekend: number | null } =>
        typeof v.price === "number" && Number.isFinite(v.price) && v.price > 0,
    );
    if (variants.length === 0) continue;
    const cheapest = variants.reduce((a, b) => (b.price < a.price ? b : a));
    const entry: MenuSetSummary = {
      name: (r.name_en ?? r.name_ko ?? "Set").trim(),
      description: latinDescription(r.description),
      label: cheapest.label_en?.trim() || null,
      price: cheapest.price,
    };
    const bucket = acc.get(r.club_id) ?? { sets: [], items: [], prices: [] };
    bucket.prices.push(...variants.map((v) => v.price));
    if (r.category === "set" && !r.is_vvip) bucket.sets.push(entry);
    else if (!r.is_vvip) bucket.items.push(entry);
    acc.set(r.club_id, bucket);
  }
  for (const [id, b] of acc) {
    const sets = [...b.sets].sort((x, y) => x.price - y.price);
    const items = [...b.items].sort((x, y) => x.price - y.price);
    out.set(id, {
      lowestSet: sets.length ? sets[0].price : null,
      lowestItem: b.prices.length ? Math.min(...b.prices) : null,
      highest: b.prices.length ? Math.max(...b.prices) : null,
      setCount: sets.length,
      itemCount: b.prices.length,
      // 8개까지 — representativeItems()가 하한 미달 저가 항목을 걸러내므로, 3개만
      // 남기면 저가 항목이 그 자리를 다 차지한 클럽에서 후보가 통째로 사라진다.
      topSets: sets.slice(0, 8),
      topItems: items.slice(0, 8),
    });
  }
  return out;
}

/**
 * 메뉴 구성물 설명에서 외국어 트랙에 보여줄 부분만 남긴다.
 *
 * description은 운영자가 한국어·영어를 섞어 적는다("Jean Pierre 1B + Absolut 1B / 장 피에르 + 앱솔루트").
 * 그대로 외국어 페이지·JSON-LD·FAQ에 실으면 읽을 수 없는 문자가 가격 근거 문장에 박힌다
 * (크리틱 3차). "/" 로 나눠 한글 없는 조각만 쓰고, 남는 게 없으면 아예 안 쓴다.
 */
function latinDescription(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const clean = t
    .split("/")
    .map((seg) => seg.trim())
    .filter((seg) => seg && !/[가-힣]/.test(seg));
  const joined = clean.join(" / ").trim();
  return joined || null;
}

/**
 * 테이블 예약의 "대표 메뉴"로 보여줄 만한 최저 항목을 고른다.
 *
 * 왜 하한이 필요한가(2026-09-10, 사용자 지적): Dawn의 Corona Set은 ₩40,000인데 이태원
 * 예약 하한은 ₩500,000이다. 이걸 그대로 "최저 세트"로 내걸면 12배 차이라 손님이
 * "4만원에 예약되나?"로 오해하고, 폼에서 실제 금액을 보는 순간 이탈한다. 이런 항목은
 * 테이블 예약 단위가 아니라 바에서 한 병 시키는 메뉴에 가깝다.
 *
 * 기준 = 지역 하한의 20%. 실측(26곳)에서 20% 미만은 8곳뿐이고 전부 단품 한 병·맥주
 * 세트류였다. 25%로 올리면 Day&night(20%)·K-Bat(20%) 같은 정상 케이스까지 잘려 나간다.
 */
const REPRESENTATIVE_MIN_RATIO = 0.2;

export function representativeItems(
  area: string | null | undefined,
  items: MenuSetSummary[] | undefined,
): MenuSetSummary[] {
  if (!items?.length) return [];
  const min = bookingFloor(area) * REPRESENTATIVE_MIN_RATIO;
  const kept = items.filter((i) => i.price >= min);
  // 전부 걸러지면(그 클럽 메뉴가 통째로 저가) 원본을 준다 — 빈손보다는 낫고,
  // 화면에서 "×N개 필요" 표기가 오해를 막는다.
  return kept.length ? kept : items;
}

/** 폼 카드와 같은 숫자 — "이 클럽 예약이 실제로 시작하는 금액". 메뉴가 없으면 null. */
export function tableFrom(area: string | null | undefined, s: ClubPriceSummary | null | undefined): number | null {
  if (!s) return null;
  const base = s.lowestSet ?? s.lowestItem;
  if (base == null) return null;
  return Math.max(bookingFloor(area), base);
}

/**
 * 최저 항목으로 최저소비를 채우려면 몇 개가 필요한가(올림). "2~3개면 도달"이라는 문장을
 * 데이터로 검증하기 위한 값 — Dawn처럼 ₩40,000 세트가 있는 클럽에서 그 문장은 거짓이었다
 * (크리틱 2차). 기준 항목이 없으면 null.
 */
export function itemsToReachFloor(area: string | null | undefined, s: ClubPriceSummary | null | undefined): number | null {
  const base = s?.lowestSet ?? s?.lowestItem ?? null;
  if (base == null || base <= 0) return null;
  return Math.max(1, Math.ceil(bookingFloor(area) / base));
}

/** ₩500,000 */
export function formatWon(n: number): string {
  return `₩${n.toLocaleString("en-US")}`;
}

/**
 * title·스티키 CTA처럼 글자 수가 아까운 자리용 축약.
 * en: ₩500k / ₩1M — ja·zh·zh-tw: 50万ウォン / 50万韩元 / 50萬韓元.
 * k·M 약어와 ₩ 기호는 일·중 검색자에게 안 읽힌다(크리틱 1차 지적).
 */
export function wonCompact(n: number, lang: "en" | "ja" | "zh" | "zh-tw" = "en"): string {
  if (lang === "en") {
    if (n >= 1_000_000) {
      const m = n / 1_000_000;
      return `₩${Number.isInteger(m) ? m : m.toFixed(1)}M`;
    }
    return `₩${Math.round(n / 1000)}k`;
  }
  // 만 단위 — 50만/100만/150만
  const man = n / 10_000;
  const num = Number.isInteger(man) ? String(man) : man.toFixed(1);
  if (lang === "ja") return `${num}万ウォン`;
  if (lang === "zh") return `${num}万韩元`;
  return `${num}萬韓元`;
}

/**
 * description을 문장 경계에서 자른다 — `.slice(0,160)`은 "…Rated", "…日本語でテーブル"처럼
 * 문장 중간에서 끊겨 스니펫이 깨진다(크리틱 2차). 마지막 온전한 문장 끝(. 。)까지만 남기고,
 * 첫 문장조차 못 담으면 그때만 하드 컷.
 */
export function trimAtSentence(text: string, max = 160): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const cut = Math.max(head.lastIndexOf(". "), head.lastIndexOf("。"), head.lastIndexOf(".\n"));
  if (cut >= 40) return head.slice(0, cut + 1).trim();
  return head.replace(/\s+\S*$/, "").trim() + "…";
}
