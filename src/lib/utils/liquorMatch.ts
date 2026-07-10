import { BRAND_ALIASES } from "@/lib/constants/liquor";
import type { LiquorProduct } from "@/types/database";

/**
 * 오퍼의 자유 텍스트 includes 항목(예: "돔페 3병")을 liquor_products 레코드에 매칭.
 * 매칭 실패 시 null — 호출부는 카테고리 폴백으로 처리하고 절대 렌더링을 막지 않아야 함.
 */
export function matchLiquorProduct(includeText: string, products: LiquorProduct[]): LiquorProduct | null {
  const normalized = includeText.trim().toLowerCase();

  for (const p of products) {
    if (includeText.includes(p.name)) return p;
    if (p.aliases.some((a) => normalized.includes(a.toLowerCase()))) return p;
  }

  for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
    if (normalized.includes(alias)) {
      const hit = products.find((p) => p.name === canonical);
      if (hit) return hit;
    }
  }

  return null;
}
