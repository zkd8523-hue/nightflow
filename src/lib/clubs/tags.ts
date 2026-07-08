export type ClubTagGroup =
  | "venue_type"
  | "genre"
  | "smoking";

export interface ClubTagOption {
  key: string;
  label: string;
  /** 좁은 공간에 표시할 때 사용 (예: 특징 아이콘 그리드). 미지정 시 label 사용 */
  shortLabel?: string;
}

export interface ClubTagGroupDef {
  group: ClubTagGroup;
  label: string;
  emoji: string;
  isFilter: boolean;
  /** true면 단일 선택 (같은 그룹의 다른 태그는 자동 제거) */
  isSingle?: boolean;
  options: ClubTagOption[];
}

export const CLUB_TAG_GROUPS: ClubTagGroupDef[] = [
  {
    group: "venue_type",
    label: "타입",
    emoji: "",
    isFilter: true,
    isSingle: true,
    options: [
      { key: "club", label: "클럽" },
      { key: "lounge", label: "라운지" },
      { key: "pub", label: "펍" },
    ],
  },
  {
    group: "genre",
    label: "음악",
    emoji: "🎵",
    isFilter: true,
    options: [
      { key: "edm", label: "EDM" },
      { key: "hiphop", label: "힙합" },
      { key: "rnb", label: "R&B" },
      { key: "kpop", label: "K-POP" },
      { key: "pop", label: "팝" },
      { key: "house", label: "하우스" },
      { key: "latin", label: "라틴" },
      { key: "techno", label: "테크노" },
      { key: "rock", label: "락" },
      { key: "mix", label: "믹스" },
    ],
  },
  {
    group: "smoking",
    label: "흡연",
    emoji: "🚬",
    isFilter: false,
    isSingle: true,
    options: [
      { key: "allowed", label: "흡연" },
      { key: "vape_only", label: "전자담배" },
      { key: "not_allowed", label: "금연" },
    ],
  },
];

export const FILTER_GROUPS = CLUB_TAG_GROUPS.filter((g) => g.isFilter);
export const FEATURE_GROUPS = CLUB_TAG_GROUPS.filter((g) => !g.isFilter);

export const AREA_OPTIONS = [
  "강남",
  "홍대",
  "이태원",
  "수원",
  "대구",
  "부산",
  "광주",
] as const;

export type AreaOption = (typeof AREA_OPTIONS)[number];

// 서울 = 강남 ∪ 홍대 ∪ 이태원 (메타 단축 칩)
export const SEOUL_AREAS: AreaOption[] = ["강남", "홍대", "이태원"];

export function makeTag(group: ClubTagGroup, key: string): string {
  return `${group}:${key}`;
}

export function parseTag(tag: string): { group: string; key: string } | null {
  const idx = tag.indexOf(":");
  if (idx === -1) return null;
  return { group: tag.slice(0, idx), key: tag.slice(idx + 1) };
}

export function getTagLabel(tag: string): string | null {
  const parsed = parseTag(tag);
  if (!parsed) return null;
  const group = CLUB_TAG_GROUPS.find((g) => g.group === parsed.group);
  if (!group) return null;
  const option = group.options.find((o) => o.key === parsed.key);
  return option?.label ?? null;
}

export function getTagsByGroup(
  tags: string[],
  group: ClubTagGroup
): ClubTagOption[] {
  const def = CLUB_TAG_GROUPS.find((g) => g.group === group);
  if (!def) return [];
  return tags
    .map(parseTag)
    .filter((p): p is { group: string; key: string } => p?.group === group)
    .map((p) => def.options.find((o) => o.key === p.key))
    .filter((o): o is ClubTagOption => !!o);
}
