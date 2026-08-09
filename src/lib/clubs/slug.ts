// 외국인 트랙 클럽 개별 페이지(/en/clubs/{area}/{club})용 URL 슬러그.
//
// 배경: 클럽 상세가 시트(모달)로만 존재해 "Hongdae B1 opening hours" 같은
// 클럽명+속성 검색에 걸릴 URL 자체가 없었다(2026-08-09 SEO 감사).
// 슬러그는 DB에 저장하지 않고 name_en에서 파생한다 — 컬럼·마이그레이션 없이
// name_en만 정확하면 URL이 따라오고, 이름이 바뀌면 URL도 같이 바뀐다.

/** "Groove & Spot" → "groove-and-spot", "vurt." → "vurt", "+82" → "82" */
export function clubSlug(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * DB의 한글 지역명 → 영어 URL 세그먼트(정본 1개).
 * 강남에 gangnam/apgujeong 두 페이지가 있는데 둘 다 koreanArea="강남"이라,
 * 클럽 페이지를 양쪽에 열어두면 중복 콘텐츠가 된다. 정본은 gangnam 하나로 고정하고
 * apgujeong 쪽 요청은 클럽 페이지에서 정본으로 308 리다이렉트한다.
 */
export const CANONICAL_AREA_SLUG: Record<string, string> = {
  강남: "gangnam",
  홍대: "hongdae",
  이태원: "itaewon",
  부산: "busan",
};

/** 영어 지역 페이지가 있는 지역만 클럽 페이지를 생성한다(부모 없는 고아 페이지 방지). */
export function canonicalAreaSlug(koreanArea: string | null | undefined): string | null {
  if (!koreanArea) return null;
  return CANONICAL_AREA_SLUG[koreanArea.trim()] ?? null;
}
