/**
 * 클럽 리뷰 태그 — 긍정만. 부정/차별 라벨 금지.
 * "다음 방문자를 위해 클럽 프로필 작성해주시겠어요?"
 */

export interface ReviewTagOption {
  key: string;
  label: string;
  emoji: string;
}

export const REVIEW_TAGS: ReviewTagOption[] = [
  { key: "music", label: "음악이 좋아요", emoji: "🎵" },
  { key: "vibe", label: "분위기가 좋아요", emoji: "✨" },
  { key: "seat", label: "자리가 좋아요", emoji: "🛋" },
  { key: "md_friendly", label: "MD가 친절해요", emoji: "💁" },
  { key: "dj", label: "DJ가 좋아요", emoji: "🎧" },
  { key: "crowded", label: "사람이 많아요", emoji: "👥" },
  { key: "dancing", label: "춤추기 좋아요", emoji: "💃" },
  { key: "private", label: "프라이빗해요", emoji: "🔒" },
  { key: "photo", label: "사진 잘 나와요", emoji: "📸" },
  { key: "events", label: "이벤트가 다양해요", emoji: "🎉" },
  { key: "liquor", label: "주류 구성이 좋아요", emoji: "🍾" },
  { key: "revisit", label: "또 가고 싶어요", emoji: "🔁" },
];

export function getReviewTagLabel(key: string): ReviewTagOption | null {
  return REVIEW_TAGS.find((t) => t.key === key) ?? null;
}

export type ReviewSource = "verified" | "self";
