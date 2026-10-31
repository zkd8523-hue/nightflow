// 담당자 구성 고르기(2026-11-01) 공용 — 메뉴 목록 로드, 가격 계산, 서버 검증.
//
// 담당자는 제안서에서 글로 적지 않고 클럽 메뉴판에서 품목을 고른다. 가격은 클라이언트가 보낸 값을 믿지 않고
// 서버가 DB(club_menu_variants)에서 다시 계산한다. 금액(손님이 낸 예산)을 넘으면 저장하지 않는다.
// 정상 범위는 금액의 80~100% — 80% 미만은 저장되지만 손님 확인서에 안내가 붙는다.

import type { SupabaseClient } from "@supabase/supabase-js";

export const BAND_LOW = 0.8;

export type TcRule = { below_bottles: number; amount: number } | null;

export type PickerVariant = { id: string; label: string; price: number };
export type PickerItem = { id: string; cat: string; name: string; nameKo: string | null; variants: PickerVariant[] };

/** 금·토는 주말 가격(ForeignRequestForm.isWeekend와 같은 기준). */
export const isWeekendDate = (isoDate: string): boolean => {
  const d = new Date(isoDate + "T00:00:00").getDay();
  return d === 5 || d === 6;
};

export const parseTcRule = (raw: unknown): TcRule => {
  const r = raw as { below_bottles?: unknown; amount?: unknown } | null;
  return r && typeof r.below_bottles === "number" && typeof r.amount === "number"
    ? { below_bottles: r.below_bottles, amount: r.amount }
    : null;
};

/** "3 bottle set"=3, "1 bottle"=1 — 라벨에서 병 수를 읽는다. 읽을 수 없는 세트("Set")는 null. */
export const bottlesOfLabel = (label: string): number | null => {
  const m = label.match(/^(\d+)\s*bottle/i);
  return m ? Number(m[1]) : null;
};

export const tcFor = (rule: TcRule, bottles: number): number => (rule && bottles < rule.below_bottles ? rule.amount : 0);

/** 담당자 메뉴판 — 활성 품목만, 조건부·층별·VVIP 전용은 제외(손님이 어떤 테이블인지 알 수 없다). 요일 가격 반영. */
export async function loadPickerMenu(sb: SupabaseClient, clubId: string, weekend: boolean): Promise<PickerItem[]> {
  const { data } = await sb
    .from("club_menu_items")
    .select("id, category, name_en, name_ko, is_vvip, zone, condition_note, condition_note_en, sort_order, variants:club_menu_variants(id, label_en, price, price_weekend, sort_order)")
    .eq("club_id", clubId)
    .eq("is_active", true)
    .order("sort_order");
  const items: PickerItem[] = [];
  for (const x of (data ?? []) as unknown as {
    id: string; category: string; name_en: string; name_ko: string | null; is_vvip: boolean; zone: string | null;
    condition_note: string | null; condition_note_en: string | null;
    variants: { id: string; label_en: string; price: number; price_weekend: number | null; sort_order: number | null }[] | null;
  }[]) {
    if (x.is_vvip || x.zone || x.condition_note || x.condition_note_en) continue;
    const vs = [...(x.variants ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (vs.length === 0) continue;
    items.push({
      id: x.id, cat: x.category, name: x.name_en, nameKo: x.name_ko,
      variants: vs.map((v) => ({ id: v.id, label: v.label_en, price: weekend ? (v.price_weekend ?? v.price) : v.price })),
    });
  }
  const order: Record<string, number> = { champagne: 0, whisky: 1, cognac: 2, tequila: 3, vodka: 4, liqueur: 5, set: 6 };
  items.sort((a, b) => (order[a.cat] ?? 9) - (order[b.cat] ?? 9) || Math.min(...a.variants.map((v) => v.price)) - Math.min(...b.variants.map((v) => v.price)));
  return items;
}

export type MdMenuLine = { item_id: string; variant_id: string; name_en: string; name_ko: string | null; label_en: string; price: number; qty: number };
export type MdMenu = { lines: MdMenuLine[]; tc: number; total: number; bottles: number };

/** 클라이언트가 보낸 {variant_id, qty}[] + tc → DB 가격으로 다시 계산. 잘못된 입력은 error 코드로. */
export async function buildMdMenu(
  sb: SupabaseClient,
  o: { clubId: string; weekend: boolean; picks: { variant_id: string; qty: number }[]; tc: number; budget: number | null },
): Promise<{ ok: true; menu: MdMenu } | { ok: false; error: "menu_invalid" | "menu_over_budget" | "menu_empty" }> {
  const picks = o.picks.filter((p) => p && typeof p.variant_id === "string" && Number.isInteger(p.qty) && p.qty > 0 && p.qty <= 50);
  if (picks.length === 0) return { ok: false, error: "menu_empty" };
  if (picks.length > 40) return { ok: false, error: "menu_invalid" };
  const items = await loadPickerMenu(sb, o.clubId, o.weekend);
  const byVariant = new Map<string, { item: PickerItem; v: PickerVariant }>();
  items.forEach((it) => it.variants.forEach((v) => byVariant.set(v.id, { item: it, v })));
  const lines: MdMenuLine[] = [];
  let bottles = 0;
  for (const p of picks) {
    const hit = byVariant.get(p.variant_id);
    if (!hit) return { ok: false, error: "menu_invalid" }; // 다른 클럽 품목이거나 비활성
    lines.push({ item_id: hit.item.id, variant_id: p.variant_id, name_en: hit.item.name, name_ko: hit.item.nameKo, label_en: hit.v.label, price: hit.v.price, qty: p.qty });
    bottles += p.qty * (bottlesOfLabel(hit.v.label) ?? 1);
  }
  const tc = Number.isInteger(o.tc) && o.tc >= 0 && o.tc <= 5_000_000 ? o.tc : 0;
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0) + tc;
  if (o.budget != null && total > o.budget) return { ok: false, error: "menu_over_budget" };
  return { ok: true, menu: { lines, tc, total, bottles } };
}

/** 확인서 "포함" 줄 — 품목 + TC(0원이어도 적는다: 빠졌는지 0원인지 헷갈리지 않게). */
export function menuToIncludes(menu: MdMenu): string[] {
  const out = menu.lines.map((l) => `${l.qty} ${l.name_en}${l.label_en && !/^1 bottle$/i.test(l.label_en) && !/^set$/i.test(l.label_en) ? ` · ${l.label_en}` : ""}`);
  out.push(`Table charge ₩${menu.tc.toLocaleString("en-US")}`);
  return out;
}
