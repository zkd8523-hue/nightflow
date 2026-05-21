export type ClubTagGroup =
  | "genre"
  | "crowd"
  | "space"
  | "age"
  | "entry";

export interface ClubTagOption {
  key: string;
  label: string;
}

export interface ClubTagGroupDef {
  group: ClubTagGroup;
  label: string;
  emoji: string;
  isFilter: boolean;
  options: ClubTagOption[];
}

export const CLUB_TAG_GROUPS: ClubTagGroupDef[] = [
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
      { key: "latin", label: "라틴" },
      { key: "techno", label: "테크노" },
    ],
  },
  {
    group: "crowd",
    label: "고객층",
    emoji: "🌏",
    isFilter: false,
    options: [
      { key: "local", label: "내국인 위주" },
      { key: "foreign", label: "외국인 위주" },
      { key: "mixed", label: "믹스" },
    ],
  },
  {
    group: "space",
    label: "공간",
    emoji: "🏛",
    isFilter: false,
    options: [
      { key: "vip", label: "VIP" },
      { key: "standing", label: "스탠딩" },
      { key: "lounge", label: "라운지" },
      { key: "rooftop", label: "루프탑" },
    ],
  },
  {
    group: "age",
    label: "연령대",
    emoji: "👥",
    isFilter: false,
    options: [
      { key: "early20s", label: "20대 초중반" },
      { key: "late20s", label: "20대 후반~30대" },
      { key: "mixed", label: "믹스" },
    ],
  },
  {
    group: "entry",
    label: "입장료",
    emoji: "💰",
    isFilter: false,
    options: [
      { key: "free", label: "무료" },
      { key: "low", label: "1~2만원" },
      { key: "mid", label: "2~3만원" },
      { key: "high", label: "3만원+" },
    ],
  },
];

export const FILTER_GROUPS = CLUB_TAG_GROUPS.filter((g) => g.isFilter);
export const FEATURE_GROUPS = CLUB_TAG_GROUPS.filter((g) => !g.isFilter);

export const AREA_OPTIONS = [
  "강남",
  "홍대",
  "이태원",
  "광주",
  "부산",
  "대구",
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
