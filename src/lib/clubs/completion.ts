import type { Club } from "@/types/database";
import { CLUB_TAG_GROUPS, parseTag } from "@/lib/clubs/tags";

/**
 * 파트너 MD가 책임지는 필드 (operating_hours + tags 4그룹) 기준 완성도 계산.
 *
 * - operating_hours 존재: 50%
 * - tags 4그룹 (genre/age/entry/smoking) 중 채워진 그룹 수 × 12.5%
 *
 * 100%: 영업시간 있음 + 4개 그룹 모두 1개 이상의 태그
 *
 * 드레스코드(dresscode)는 완성도 계산에 포함하지 않음 (자유 텍스트).
 */
export function getClubProfileCompletion(
  club: Pick<Club, "operating_hours" | "tags">
): {
  percent: number;
  missing: string[]; // 비어있는 항목 한글 라벨
} {
  let percent = 0;
  const missing: string[] = [];

  const hasOperatingHours = !!club.operating_hours && club.operating_hours.trim().length > 0;
  if (hasOperatingHours) {
    percent += 50;
  } else {
    missing.push("영업시간");
  }

  const tags = (club.tags ?? []) as string[];
  const filledGroups = new Set<string>();
  for (const tag of tags) {
    const parsed = parseTag(tag);
    if (parsed) filledGroups.add(parsed.group);
  }

  const allGroups = CLUB_TAG_GROUPS.map((g) => g.group);
  const groupWeight = 50 / allGroups.length;
  for (const g of allGroups) {
    if (filledGroups.has(g)) {
      percent += groupWeight;
    } else {
      const def = CLUB_TAG_GROUPS.find((cg) => cg.group === g);
      if (def) missing.push(def.label);
    }
  }

  return { percent: Math.round(percent), missing };
}
