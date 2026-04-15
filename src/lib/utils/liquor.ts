import {
  LIQUOR_CATEGORIES,
  LIQUOR_BRANDS,
  BRAND_ALIASES,
  LIQUOR_KEYWORDS,
} from "@/lib/constants/liquor";

// 브랜드 → 카테고리 키 역매핑 (한번만 생성)
const brandToCategoryKey: Record<string, string> = {};
for (const [catKey, brands] of Object.entries(LIQUOR_BRANDS)) {
  for (const brand of brands) {
    brandToCategoryKey[brand] = catKey;
  }
}

// 카테고리 키 → 한글 라벨
const categoryKeyToLabel: Record<string, string> = {};
for (const cat of LIQUOR_CATEGORIES) {
  categoryKeyToLabel[cat.key] = cat.label;
}

// 카테고리 라벨 Set (이미 카테고리인지 판별)
const categoryLabels = new Set(LIQUOR_CATEGORIES.map((c) => c.label));

/**
 * 주류 아이템에서 브랜드를 카테고리로 변환
 * "발렌타인 17년 2병" → "위스키 2병"
 * "하드 2병" → "하드 2병" (이미 카테고리)
 * "과일 플레이트" → null (주류 아님)
 */
export function toLiquorCategory(item: string): string | null {
  // "브랜드명 N병" 패턴 파싱
  const match = item.match(/^(.+?)\s+(\d+병)$/);
  const name = match ? match[1].trim() : item.trim();
  const qty = match ? match[2] : null;

  // 이미 카테고리 라벨이면 그대로
  if (categoryLabels.has(name)) {
    return qty ? `${name} ${qty}` : name;
  }

  // BRAND_ALIASES로 줄임말 정규화
  const normalized = BRAND_ALIASES[name.toLowerCase()] ?? name;

  // 정규화 결과가 카테고리 라벨이면 그대로
  if (categoryLabels.has(normalized)) {
    return qty ? `${normalized} ${qty}` : normalized;
  }

  // 역매핑에서 카테고리 찾기
  const catKey = brandToCategoryKey[normalized];
  if (catKey) {
    const label = categoryKeyToLabel[catKey];
    return qty ? `${label} ${qty}` : label;
  }

  // 부분 매칭: LIQUOR_KEYWORDS에 해당하면 주류지만 카테고리 불명
  const isLiquor = LIQUOR_KEYWORDS.some((kw) => item.includes(kw));
  if (isLiquor) {
    return qty ? `기타 ${qty}` : "기타";
  }

  // 주류 아님
  return null;
}

/**
 * includes 배열에서 공개용 카테고리 목록 추출
 * 브랜드명은 카테고리로 변환, 같은 카테고리+수량은 중복 제거
 */
export function getPublicIncludes(includes: string[]): {
  liquorCategories: string[];
  extras: string[];
} {
  const liquorCategories: string[] = [];
  const extras: string[] = [];
  const seen = new Set<string>();

  for (const item of includes) {
    const category = toLiquorCategory(item);
    if (category) {
      if (!seen.has(category)) {
        seen.add(category);
        liquorCategories.push(category);
      }
    } else {
      extras.push(item);
    }
  }

  return { liquorCategories, extras };
}
