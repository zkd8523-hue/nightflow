import { LIQUOR_KEYWORDS, SELLING_POINT_KEYWORDS } from "@/lib/constants/liquor";

export function isLiquor(item: string): boolean {
  return LIQUOR_KEYWORDS.some((kw) => item.includes(kw));
}

export function isSellingPoint(item: string): boolean {
  return SELLING_POINT_KEYWORDS.some((kw) => item.includes(kw));
}

export function splitOfferIncludes(includes: string[]) {
  // 셀링포인트를 먼저 판별 — LIQUOR_KEYWORDS의 범용 키워드("병" 등)가
  // "메인테이블 1병"처럼 MD가 직접 입력한 문구에 우연히 걸려 술로 오분류되는 것을 방지.
  const sellingPoints = includes.filter(isSellingPoint);
  const rest = includes.filter((i) => !isSellingPoint(i));
  const liquors = rest.filter(isLiquor);
  const extras = rest.filter((i) => !isLiquor(i));
  return { liquors, sellingPoints, extras };
}
