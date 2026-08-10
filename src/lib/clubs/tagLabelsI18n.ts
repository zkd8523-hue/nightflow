import { type Lang } from "@/lib/i18n";
import { getTagsByGroup } from "@/lib/clubs/tags";

// 클럽 특성 태그(venue_type·genre·smoking) 키 → 외국어 라벨.
// 한국어 컴포넌트는 tags.ts의 한국어 label을 쓰므로 외국인 화면용으로 별도 매핑.
// 장르는 대부분 만국공용(EDM/R&B/K-POP…)이라 en 값을 ja/zh에도 공유.
export const TAG_LABEL_I18N: Record<string, Record<Lang, string>> = {
  // venue_type
  club:        { ko: "클럽", en: "Club", ja: "クラブ", zh: "夜店", "zh-tw": "夜店" },
  lounge:      { ko: "라운지", en: "Lounge", ja: "ラウンジ", zh: "酒廊", "zh-tw": "酒廊" },
  pub:         { ko: "펍", en: "Pub", ja: "パブ", zh: "酒吧", "zh-tw": "酒吧" },
  // genre
  edm:         { ko: "EDM", en: "EDM", ja: "EDM", zh: "EDM", "zh-tw": "EDM" },
  hiphop:      { ko: "힙합", en: "Hip-hop", ja: "ヒップホップ", zh: "嘻哈", "zh-tw": "嘻哈" },
  rnb:         { ko: "R&B", en: "R&B", ja: "R&B", zh: "R&B", "zh-tw": "R&B" },
  kpop:        { ko: "K-POP", en: "K-POP", ja: "K-POP", zh: "K-POP", "zh-tw": "K-POP" },
  pop:         { ko: "팝", en: "Pop", ja: "ポップ", zh: "流行", "zh-tw": "流行" },
  house:       { ko: "하우스", en: "House", ja: "ハウス", zh: "House", "zh-tw": "House" },
  latin:       { ko: "라틴", en: "Latin", ja: "ラテン", zh: "拉丁", "zh-tw": "拉丁" },
  techno:      { ko: "테크노", en: "Techno", ja: "テクノ", zh: "Techno", "zh-tw": "Techno" },
  rock:        { ko: "락", en: "Rock", ja: "ロック", zh: "摇滚", "zh-tw": "搖滾" },
  mix:         { ko: "믹스", en: "Mixed", ja: "ミックス", zh: "混合", "zh-tw": "混合" },
  // smoking
  allowed:     { ko: "흡연", en: "Smoking OK", ja: "喫煙可", zh: "可吸烟", "zh-tw": "可吸菸" },
  vape_only:   { ko: "전자담배", en: "Vape only", ja: "電子タバコのみ", zh: "仅电子烟", "zh-tw": "僅電子菸" },
  not_allowed: { ko: "금연", en: "Non-smoking", ja: "禁煙", zh: "禁烟", "zh-tw": "禁菸" },
};

// 클럽 tags에서 시트에 표시할 특성 배지 라벨 목록 추출 (타입 → 음악 → 흡연 순).
export function clubFeatureLabels(tags: string[] | null, lang: Lang): string[] {
  if (!tags || tags.length === 0) return [];
  const out: string[] = [];
  for (const group of ["venue_type", "genre", "smoking"] as const) {
    for (const opt of getTagsByGroup(tags, group)) {
      out.push(TAG_LABEL_I18N[opt.key]?.[lang] ?? opt.label);
    }
  }
  return out;
}
