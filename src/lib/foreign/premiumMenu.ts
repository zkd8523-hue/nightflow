// 외국어 하이엔드 페이지(샴페인 가격 비교·예산별 메뉴, 2026-10-24)용 메뉴 조회.
//
// 왜 따로 두나: tablePricing.fetchTablePricing은 "최저 금액" 요약(가장 싼 세트·단품)만 만든다.
// 이 두 페이지는 VVIP 항목까지 포함한 전 구성(1병·5병 세트·60병…)을 펼쳐서 봐야 한다.
// 클럽 상세 페이지·예약 폼은 건드리지 않는다(운영자 결정 2026-10-24 — 예약 블록에 1억짜리를
// 띄우면 일반 손님이 부담스러워한다, 고가 정보는 별도 페이지로만).
//
// 대상 클럽 판정은 RealTablePrices와 같다(서울·승인·비테스트·가이드 노출·isBookable).

import { createClient } from "@/lib/supabase/server";
import { fetchMenuClubIds, isBookable } from "@/lib/clubs/bookable";
import { canonicalAreaSlug, clubSlug } from "@/lib/clubs/slug";
import { convertKrw, langToCurrency, type KrwRates } from "@/lib/utils/currency";

export type PremiumRow = {
  clubId: string;
  /** 영문 클럽명 */
  club: string;
  /** DB 지역명(한국어) */
  area: string;
  /** 그 언어의 클럽 상세 경로. 지역 페이지가 없는 지역이면 null */
  href: string | null;
  item: string;
  label: string | null;
  /** 평일가 */
  price: number;
  category: string | null;
};

type MenuRow = {
  club_id: string;
  name_en: string | null;
  name_ko: string | null;
  category: string | null;
  variants: { label_en: string | null; price: number | null }[] | null;
};

// 메뉴판 사진을 옮기며 생긴 이름 그대로("SET 2", "A Set")는 무엇인지 알 수 없어 인용 가치가 없다.
const GENERIC_NAME = /^(?:set\s*\S{0,3}|\S{0,3}\s*set)$/i;
// 대문자만으로 적힌 이름("ARMAND DE BRIGNAC BRUT")은 다른 행과 나란히 놓으면 튄다 — 단어 첫 글자만 대문자로.
// 숫자가 든 토큰(12Y)·로마 숫자(XIII)·약어(XO·VSOP)는 그대로 둔다.
function tidyCase(name: string, keepShort = false): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (!/[A-Za-z]/.test(n) || n !== n.toUpperCase()) return n;
  return n
    .split(" ")
    .map((w) => (/\d/.test(w) || /^[XVI]+$/.test(w) || /^(XO|VSOP|V\.S\.O\.P|VS|II|III|N\.I\.R)$/.test(w) || (keepShort && w.length <= 2) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

// 같은 병이 클럽마다 다르게 적혀 있다(Armand Gold / Armand De Brignac, Dom-Perignon / Pérignon, Rose / Rosé).
// 고액 손님에겐 표기가 흔들리는 것 자체가 "대충 옮긴 메뉴"로 보인다(2026-10-24 하이엔드 점검) — 정규 표기로 맞춘다.
// 맛·등급을 바꾸는 치환은 하지 않는다(오타·표기만).
const BRAND_FIXES: [RegExp, string][] = [
  [/\bArmand(?:\s+de)?(?:\s+Brignac)?\b/gi, "Armand de Brignac"],
  [/\bDom[\s-]*P[eé]rignon\b/gi, "Dom Pérignon"],
  [/\bPerrier[\s-]*Jou[eë]t\b/gi, "Perrier-Jouët"],
  [/\bBelle\s+[EÉ]poque\b/gi, "Belle Époque"],
  [/\bMo[eë]t(?:[\s-]*(?:&\s*)?Chandon)?\b/gi, "Moët & Chandon"],
  [/\bHennessy\s+Richard\b/gi, "Richard Hennessy"],
  [/\bLumin(?:o)?us\b/gi, "Luminous"],
  [/\bRos[eé]\b/gi, "Rosé"],
  [/\bDemi[\s-]*sec\b/gi, "Demi-Sec"],
  [/\bBallantines\b/g, "Ballantine's"],
];

/** 손님에게 보일 항목명. "Armand de Brignac 2B + Louis XIII 1B" → "Armand de Brignac ×2 + Louis XIII ×1" */
export function displayItem(raw: string): string {
  let n = tidyCase(raw);
  for (const [rx, to] of BRAND_FIXES) n = n.replace(rx, to);
  // 구성 세트의 수량 표기(2B·3B, 또는 "Gold 3 +")를 ×N으로. "+"가 있는 이름만 — "Ballantine's 30"(숙성 연수)은 건드리지 않는다.
  if (n.includes("+")) n = n.replace(/\s(\d+)\s*B\b/g, " ×$1").replace(/\s(\d+)(?=\s*\+|$)/g, " ×$1");
  // 라벨이 병 수를 말하므로 이름 끝 "Set"·"3 Bottle Set"은 중복.
  n = n.replace(/\s+(?:\d+\s*Bottles?\s*)?Set$/i, "");
  return n.replace(/\s+/g, " ").trim();
}

/** 클럽 표시명 — 대문자만인 이름은 단어 첫 글자만 대문자로("HYPE SEOUL" → "Hype Seoul", "DM SEOUL" → "DM Seoul"). */
export function displayClub(name: string): string {
  return tidyCase(name, true);
}

const LABEL_WORD: Record<string, (n: string) => string> = {
  en: (n) => `${n} bottles`,
  ja: (n) => `${n}本`,
  zh: (n) => `${n} 瓶`,
  "zh-tw": (n) => `${n} 瓶`,
};
/** 구성 라벨을 손님 언어로. 1병·"Set"처럼 정보가 없는 라벨은 null. "25 + 3 bottles" → ja "25+3本" */
export function displayLabel(label: string | null, lang: string): string | null {
  if (!label) return null;
  const m = label.trim().match(/^(\d+)(?:\s*\+\s*(\d+))?\s*(?:bottles?|btl|b)?(?:\s*set)?$/i);
  if (!m) return /^set$/i.test(label.trim()) ? null : label.trim();
  if (!m[2] && m[1] === "1") return null;
  const n = m[2] ? (lang === "en" ? `${m[1]} + ${m[2]}` : `${m[1]}+${m[2]}`) : m[1];
  return (LABEL_WORD[lang] ?? LABEL_WORD.en)(n);
}

export async function fetchPremiumMenu(lang: string, areas: string[] = ["강남", "홍대", "이태원"]): Promise<PremiumRow[]> {
  const supabase = await createClient();
  const [clubsRes, menuIds] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, name_en, area, foreign_booking_agreed, partners:club_partners(md_id)")
      .is("deleted_at", null)
      .eq("status", "approved")
      .eq("is_test", false)
      .eq("hidden_from_guide", false)
      .in("area", areas),
    fetchMenuClubIds(supabase),
  ]);
  const bookables = (clubsRes.data ?? []).filter(
    (c) =>
      c.name_en?.trim() &&
      isBookable({ name: c.name, has_md: (c.partners?.length ?? 0) > 0, agreed: !!c.foreign_booking_agreed, has_menu: menuIds.has(c.id) }),
  );

  // ⚠️ club_menu_items는 1,000행 상한에 잘린다 — 4곳씩 끊어서 병렬로 받는다(클럽당 최대 ~80항목).
  const chunks = Array.from({ length: Math.ceil(bookables.length / 4) }, (_, i) => bookables.slice(i * 4, i * 4 + 4));
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("club_menu_items")
        .select("club_id, name_en, name_ko, category, variants:club_menu_variants(label_en, price)")
        .eq("is_active", true)
        .in("club_id", chunk.map((c) => c.id)),
    ),
  );

  const byId = new Map(bookables.map((c) => [c.id, c]));
  const out: PremiumRow[] = [];
  for (const res of results) {
    for (const r of (res.data ?? []) as MenuRow[]) {
      const c = byId.get(r.club_id);
      if (!c) continue;
      const raw = (r.name_en ?? "").trim();
      // 영문명이 없으면(한국어만) 외국어 페이지에 싣지 않는다 — 읽을 수 없는 이름이 가격표에 박힌다.
      if (!raw || /[가-힣]/.test(raw) || GENERIC_NAME.test(raw)) continue;
      const club = displayClub(c.name_en!);
      const areaSlug = canonicalAreaSlug(c.area);
      for (const v of r.variants ?? []) {
        if (typeof v.price !== "number" || !(v.price > 0)) continue;
        out.push({
          clubId: c.id,
          club,
          area: c.area,
          href: areaSlug ? `/${lang}/clubs/${areaSlug}/${clubSlug(c.name_en!.trim())}` : null,
          item: displayItem(raw),
          label: v.label_en?.trim() || null,
          price: v.price,
          category: r.category,
        });
      }
    }
  }
  return out;
}

/** 단품 1병 구성인가 — 브랜드별 "한 병 가격" 비교에 쓴다. 세트·다병 구성은 뺀다. */
export function isSingleBottle(r: PremiumRow): boolean {
  if (r.category === "set" || /\bset\b/i.test(r.item)) return false;
  return !r.label || /^1\s*(bottle|btl|b)\b/i.test(r.label);
}

// ── 손님 통화 표기(2026-10-24, 운영자 지적: "₩3M은 한국에서나 삼백만원") ─────────────
// 외국인은 원화로 생각하지도 검색하지도 않는다. 제목·금액은 손님 통화를 먼저, 원화는 옆에 작게.
// 환율은 주간 스냅샷(getKrwRates)이라 유효숫자 2자리로 반올림해 "대략"임을 드러낸다.


function round2(n: number): number {
  if (!(n > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 2 : 1 });

/** "≈ US$7,500" · "約120万円" · "約 NT$24 萬" · "约 5 万元". prefix=false면 앞의 "≈/約/约"를 뺀다(범위 뒤쪽용). */
export function approxLocal(krw: number, lang: string, rates: KrwRates, prefix = true, forceMan = false): string {
  const code = langToCurrency(lang);
  if (!code) return `₩${krw.toLocaleString("en-US")}`;
  const v = round2(convertKrw(krw, code, rates));
  const man = forceMan || v >= 10_000;
  if (lang === "ja") return `${prefix ? "約" : ""}${man ? `${num(v / 10_000)}万円` : `${num(v)}円`}`;
  if (lang === "zh-tw") return `${prefix ? "約 " : ""}NT$${man ? `${num(v / 10_000)} 萬` : num(v)}`;
  if (lang === "zh") return `${prefix ? "约 " : ""}${man ? `${num(v / 10_000)} 万元` : `${num(v)} 元`}`;
  return `${prefix ? "≈ " : ""}US$${num(v)}`;
}

/** "≈ US$1,100–US$1,900" — 같으면 한 값만. 위쪽이 만 단위면 아래쪽도 만 단위로("约 0.75–1.2 万元", 단위 섞임 방지). */
export function approxRange(minKrw: number, maxKrw: number, lang: string, rates: KrwRates): string {
  const code = langToCurrency(lang);
  const man = !!code && lang !== "en" && round2(convertKrw(maxKrw, code, rates)) >= 10_000;
  const a = approxLocal(minKrw, lang, rates, true, man);
  const b = approxLocal(maxKrw, lang, rates, false, man);
  if (a.endsWith(b)) return a;
  if (!man) return `${a}–${b}`;
  // 만 단위 범위는 단위를 한 번만: "约 0.75–1.2 万元", "約9.5–24万円", "約 NT$2.4–6 萬"
  const unit = lang === "ja" ? "万円" : lang === "zh" ? " 万元" : " 萬";
  return `${a.slice(0, -unit.length)}–${b.replace(/^NT\$/, "")}`;
}

export const AREA_LABEL: Record<string, Record<string, string>> = {
  en: { 강남: "Gangnam", 홍대: "Hongdae", 이태원: "Itaewon" },
  ja: { 강남: "江南", 홍대: "弘大", 이태원: "梨泰院" },
  zh: { 강남: "江南", 홍대: "弘大", 이태원: "梨泰院" },
  "zh-tw": { 강남: "江南", 홍대: "弘大", 이태원: "梨泰院" },
};
