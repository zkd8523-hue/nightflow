import { getLiquorCategory } from "@/lib/utils/format";

/**
 * 카테고리별 기본 주류 이미지 경로
 * /public/drinks/ 폴더에 실제 이미지 파일 필요
 */
export const DRINK_CATEGORY_IMAGES: Record<string, string> = {
  champagne: "/drinks/champagne.webp",
  vodka: "/drinks/vodka.webp",
  whisky: "/drinks/whisky.webp",
  tequila: "/drinks/tequila.webp",
  cognac: "/drinks/cognac.webp",
  wine: "/drinks/wine.webp",
  rum: "/drinks/rum.webp",
  gin: "/drinks/gin.webp",
  etc: "/drinks/etc.webp",
};

/**
 * includes 배열에서 주류 카테고리를 판별하여 기본 이미지 경로 반환
 * 주류가 없으면 null 반환
 */
export function getDrinkCategoryImage(includes: string[]): string | null {
  if (!includes || includes.length === 0) return null;

  const priority = ["champagne", "whisky", "cognac", "vodka", "tequila", "wine", "rum", "gin", "etc"];

  for (const item of includes) {
    const cat = getLiquorCategory(item);
    if (cat !== "extra" && priority.includes(cat)) {
      return DRINK_CATEGORY_IMAGES[cat];
    }
  }

  return null;
}
