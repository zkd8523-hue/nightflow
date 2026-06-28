// 다국어(i18n) 공유 유틸 — 외국인 트랙 한/영/일/중 지원.
//
// 기존 구조: isForeigner(불린) + t(ko, en) = isForeigner ? en : ko  (한/영 전용)
// 확장: Lang(문자열) + makeT(lang)(ko, en, ja?, zh?)  — ja/zh 미제공 시 en 폴백
//
// 사용:
//   const lang = getLang(searchParams.get("lang"));
//   const isForeigner = lang !== "ko";
//   const t = makeT(lang);
//   t("한글", "English", "日本語", "中文")   // 4개 다 주거나
//   t("한글", "English")                      // ja/zh 생략 → en 폴백

import { EN_TO_JA, EN_TO_ZH } from "./i18n-dict";

export type Lang = "ko" | "en" | "ja" | "zh";

export const FOREIGN_LANGS: Lang[] = ["en", "ja", "zh"];

// URL ?lang= 값(또는 라우트 세그먼트) → Lang. 미지정/미지원 → ko
export function getLang(raw: string | null | undefined): Lang {
  switch (raw) {
    case "en":
      return "en";
    case "ja":
      return "ja";
    case "zh":
      return "zh";
    default:
      return "ko";
  }
}

// 현재 언어 기준 번역 선택기.
// ja/zh: 호출부에 직접 인자로 주면 그걸 쓰고, 없으면 영어를 키로 사전(i18n-dict)에서 찾고,
//        그래도 없으면 영어로 폴백(영어가 최소 공통).
export function makeT(lang: Lang) {
  return (ko: string, en: string, ja?: string, zh?: string): string => {
    switch (lang) {
      case "en":
        return en;
      case "ja":
        return ja ?? EN_TO_JA[en] ?? en;
      case "zh":
        return zh ?? EN_TO_ZH[en] ?? en;
      default:
        return ko;
    }
  };
}

// 지역명 다국어 (AREA_EN 대체 — 여러 파일에 흩어진 매핑 통합)
const AREA_I18N: Record<string, { en: string; ja: string; zh: string }> = {
  "강남": { en: "Gangnam", ja: "江南(カンナム)", zh: "江南" },
  "홍대": { en: "Hongdae", ja: "弘大(ホンデ)", zh: "弘大" },
  "이태원": { en: "Itaewon", ja: "梨泰院(イテウォン)", zh: "梨泰院" },
  "건대": { en: "Konkuk", ja: "建大(コンデ)", zh: "建大" },
  "서울 어디든": { en: "Anywhere in Seoul", ja: "ソウルどこでも", zh: "首尔任意地区" },
  "부산": { en: "Busan", ja: "釜山(プサン)", zh: "釜山" },
  "대구": { en: "Daegu", ja: "大邱(テグ)", zh: "大邱" },
  "인천": { en: "Incheon", ja: "仁川(インチョン)", zh: "仁川" },
  "광주": { en: "Gwangju", ja: "光州(クァンジュ)", zh: "光州" },
  "대전": { en: "Daejeon", ja: "大田(テジョン)", zh: "大田" },
  "울산": { en: "Ulsan", ja: "蔚山(ウルサン)", zh: "蔚山" },
  "세종": { en: "Sejong", ja: "世宗(セジョン)", zh: "世宗" },
};

export function areaLabel(area: string, lang: Lang): string {
  if (lang === "ko") return area;
  const m = AREA_I18N[area];
  if (!m) return area;
  return lang === "ja" ? m.ja : lang === "zh" ? m.zh : m.en;
}
