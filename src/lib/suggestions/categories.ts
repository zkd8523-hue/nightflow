// 건의 게시판 카테고리 (Migration 501)
export type SuggestionCategory = "nightflow" | "culture" | "club_issue";

export const SUGGESTION_CATEGORIES: {
  value: SuggestionCategory;
  label: string;
  emoji: string;
  hint: string;
  /** 등록 폼 내용 플레이스홀더 */
  contentPlaceholder: string;
}[] = [
  {
    value: "nightflow",
    label: "나플에 바라는 점",
    emoji: "💡",
    hint: "앱 개선·건의",
    contentPlaceholder: "어떤 점이 불편했는지, 어떻게 바뀌면 좋을지 적어주세요",
  },
  {
    value: "culture",
    label: "클럽 문화 이야기",
    emoji: "🎧",
    hint: "씬·매너·팁 토론",
    contentPlaceholder: "클럽 문화·매너·꿀팁, 자유롭게 이야기해요",
  },
  {
    value: "club_issue",
    label: "클럽 문제 제보",
    emoji: "🆘",
    hint: "겪은 문제·주의사항",
    contentPlaceholder: "어떤 문제를 겪었는지, 다른 분들이 주의할 점을 적어주세요",
  },
];

export const SUGGESTION_CATEGORY_MAP: Record<SuggestionCategory, { label: string; emoji: string }> =
  Object.fromEntries(SUGGESTION_CATEGORIES.map((c) => [c.value, { label: c.label, emoji: c.emoji }])) as Record<
    SuggestionCategory,
    { label: string; emoji: string }
  >;

export function suggestionCategoryLabel(cat: string | null | undefined): string {
  if (!cat) return "";
  const m = SUGGESTION_CATEGORY_MAP[cat as SuggestionCategory];
  return m ? `${m.emoji} ${m.label}` : "";
}
