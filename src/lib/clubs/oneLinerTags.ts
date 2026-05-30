/**
 * 클럽 한 줄 리뷰 태그 정의 + 키워드 매칭
 *
 * - 태그 코드는 영문 snake_case (DB tags 컬럼에 저장됨)
 * - 카테고리는 시트에서 분류 노출 시 사용
 * - keywords는 유저 자유 텍스트에서 부분 매칭(includes) → 추천 태그
 *   유저는 추천을 직접 탭으로 선택 (자동 체크 안 됨)
 */

export type OneLinerTagCategory =
  | "music"
  | "crowd"
  | "table"
  | "md"
  | "facility"
  | "concept";

export interface OneLinerTagDef {
  code: string;
  label: string;
  emoji: string;
  category: OneLinerTagCategory;
  keywords: string[];
}

export const ONE_LINER_TAG_CATEGORIES: { key: OneLinerTagCategory; label: string }[] = [
  { key: "music", label: "음악·분위기" },
  { key: "crowd", label: "손님층" },
  { key: "table", label: "테이블·서비스" },
  { key: "md", label: "MD·운영" },
  { key: "facility", label: "시설·공간" },
  { key: "concept", label: "컨셉" },
];

export const ONE_LINER_TAGS: OneLinerTagDef[] = [
  // 🎶 음악·분위기
  {
    code: "music_fire",
    label: "음악이 미쳤어요",
    emoji: "🎵",
    category: "music",
    keywords: ["음악", "노래", "사운드", "비트", "베이스", "사블", "쩜"],
  },
  {
    code: "vibe_top",
    label: "분위기 최고예요",
    emoji: "💃",
    category: "music",
    keywords: ["분위기", "바이브", "vibe", "느낌", "무드"],
  },
  {
    code: "tension_crazy",
    label: "텐션 미쳤어요",
    emoji: "🔥",
    category: "music",
    keywords: ["텐션", "미쳤", "광기", "불타", "찐텐", "흥"],
  },
  {
    code: "vibe_chill",
    label: "차분한 분위기예요",
    emoji: "🌙",
    category: "music",
    keywords: ["차분", "조용", "라운지", "chill", "잔잔"],
  },
  {
    code: "dj_lineup",
    label: "DJ 라인업이 좋아요",
    emoji: "🎧",
    category: "music",
    keywords: ["DJ", "디제이", "라인업", "lineup", "스핀", "취향", "장르", "힙합", "edm", "테크노", "하우스"],
  },

  // 👥 손님층
  {
    code: "sex_ratio_good",
    label: "성비가 좋아요",
    emoji: "⚖️",
    category: "crowd",
    keywords: ["성비", "비율", "남녀", "여자", "남자"],
  },
  {
    code: "attractive_guests",
    label: "손님들이 매력적이에요",
    emoji: "💎",
    category: "crowd",
    keywords: ["수질", "예쁜", "이쁜", "잘생", "매력", "퀄"],
  },
  {
    code: "late_20s",
    label: "20대 후반 많아요",
    emoji: "🧑",
    category: "crowd",
    keywords: ["20대 후반", "20후", "직장인", "성숙"],
  },
  {
    code: "early_20s",
    label: "20대 초중반 많아요",
    emoji: "👶",
    category: "crowd",
    keywords: ["20대 초", "20초", "어린", "대학생", "영"],
  },

  // 🍾 테이블·서비스
  {
    code: "table_clean",
    label: "테이블이 깨끗해요",
    emoji: "🍾",
    category: "table",
    keywords: ["테이블", "깨끗", "청결", "위생"],
  },
  {
    code: "seat_comfy",
    label: "좌석이 편해요",
    emoji: "🛋",
    category: "table",
    keywords: ["좌석", "소파", "의자", "편"],
  },
  {
    code: "booze_good",
    label: "주류 구성 좋아요",
    emoji: "🥂",
    category: "table",
    keywords: ["주류", "안주", "샴페인", "양주", "위스키", "술"],
  },
  {
    code: "minimum_fair",
    label: "가격이 합리적이에요",
    emoji: "🍻",
    category: "table",
    keywords: ["미니멈", "가격", "합리", "저렴", "가성비"],
  },
  {
    code: "entry_fast",
    label: "입장 빨라요",
    emoji: "⏰",
    category: "table",
    keywords: ["입장", "줄", "웨이팅", "빨리", "기다림"],
  },

  // 👔 MD·운영
  {
    code: "md_kind",
    label: "MD가 친절해요",
    emoji: "👔",
    category: "md",
    keywords: ["MD", "친절", "응대", "매니저"],
  },
  {
    code: "md_fast",
    label: "MD 응대 빨라요",
    emoji: "💬",
    category: "md",
    keywords: ["답장", "빠른 답", "응대 빨라", "신속"],
  },
  {
    code: "md_extra",
    label: "서비스가 많아요",
    emoji: "🎁",
    category: "md",
    keywords: ["챙겨", "서비스", "써비스", "보너스", "선물"],
  },
  // 🏛 시설·공간
  {
    code: "interior_nice",
    label: "인테리어 멋져요",
    emoji: "✨",
    category: "facility",
    keywords: ["인테리어", "내부", "디자인", "장식", "조명"],
  },
  {
    code: "toilet_clean",
    label: "화장실 깨끗해요",
    emoji: "🚻",
    category: "facility",
    keywords: ["화장실", "변기", "세면대"],
  },
  {
    code: "access_good",
    label: "교통 편해요",
    emoji: "🚇",
    category: "facility",
    keywords: ["교통", "지하철", "역", "버스", "위치"],
  },

  // 🎉 컨셉
  {
    code: "event_variety",
    label: "이벤트 다양해요",
    emoji: "🎉",
    category: "concept",
    keywords: ["이벤트", "행사", "프로모션", "프로모"],
  },
  {
    code: "unique_concept",
    label: "특별한 컨셉이에요",
    emoji: "🎭",
    category: "concept",
    keywords: ["컨셉", "유니크", "독특", "테마"],
  },
  {
    code: "photogenic",
    label: "인증샷 잘 나와요",
    emoji: "📸",
    category: "concept",
    keywords: ["인증샷", "사진", "포토", "셀카", "예쁘게"],
  },
];

export const ONE_LINER_TAG_MAP: Record<string, OneLinerTagDef> = Object.fromEntries(
  ONE_LINER_TAGS.map((t) => [t.code, t])
);

/**
 * 자유 텍스트에서 매칭되는 태그 코드를 반환.
 * - 대소문자 무시
 * - 키워드 부분 문자열 포함 시 매칭
 * - 매칭 강도(매칭 키워드 수) 기준 내림차순 정렬, 최대 max개
 */
export function matchTagsFromText(text: string, max = 6): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const scored: { code: string; score: number }[] = [];
  for (const tag of ONE_LINER_TAGS) {
    let score = 0;
    for (const kw of tag.keywords) {
      if (normalized.includes(kw.toLowerCase())) score += 1;
    }
    if (score > 0) scored.push({ code: tag.code, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((s) => s.code);
}
