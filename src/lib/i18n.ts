// 다국어(i18n) 공유 유틸 — 외국인 트랙 한/영/일/중(간체)/중(번체) 지원.
//
// 기존 구조: isForeigner(불린) + t(ko, en) = isForeigner ? en : ko  (한/영 전용)
// 확장: Lang(문자열) + makeT(lang)(ko, en, ja?, zh?, zhTw?)
//
// 사용:
//   const lang = getLang(searchParams.get("lang"));
//   const isForeigner = lang !== "ko";
//   const t = makeT(lang);
//   t("한글", "English", "日本語", "中文", "繁體中文")   // 5개 다 주거나
//   t("한글", "English")                                 // 나머지 자동 폴백
//
// 폴백 규칙:
//   - ja: ja 인자 → EN_TO_JA 사전 → en
//   - zh: zh 인자 → EN_TO_ZH 사전 → en
//   - zh-tw: zhTw 인자 → EN_TO_ZH_TW 사전 → 간체 zh 인자 → EN_TO_ZH 사전 → en
//     (번체 없으면 간체로 우선 폴백, 최후 en. 대만·홍콩 유저가 간체 이해 가능)

import { EN_TO_JA, EN_TO_ZH, EN_TO_ZH_TW } from "./i18n-dict";

export type Lang = "ko" | "en" | "ja" | "zh" | "zh-tw";

export const FOREIGN_LANGS: Lang[] = ["en", "ja", "zh", "zh-tw"];

// URL ?lang= 값(또는 라우트 세그먼트) → Lang. 미지정/미지원 → ko
// zh-TW·zh-HK·zh-Hant 계열 모두 "zh-tw"로 정규화 (대만·홍콩 통합 번체 트랙)
export function getLang(raw: string | null | undefined): Lang {
  if (!raw) return "ko";
  const lower = raw.toLowerCase();
  switch (lower) {
    case "en":
      return "en";
    case "ja":
      return "ja";
    case "zh":
    case "zh-cn":
    case "zh-hans":
      return "zh";
    case "zh-tw":
    case "zh-hk":
    case "zh-hant":
      return "zh-tw";
    default:
      return "ko";
  }
}

// 현재 언어 기준 번역 선택기.
export function makeT(lang: Lang) {
  return (ko: string, en: string, ja?: string, zh?: string, zhTw?: string): string => {
    switch (lang) {
      case "en":
        return en;
      case "ja":
        return ja ?? EN_TO_JA[en] ?? en;
      case "zh":
        return zh ?? EN_TO_ZH[en] ?? en;
      case "zh-tw":
        return zhTw ?? EN_TO_ZH_TW[en] ?? zh ?? EN_TO_ZH[en] ?? en;
      default:
        return ko;
    }
  };
}

// 지역명 다국어 (AREA_EN 대체 — 여러 파일에 흩어진 매핑 통합)
const AREA_I18N: Record<string, { en: string; ja: string; zh: string; zhTw: string }> = {
  "강남": { en: "Gangnam", ja: "江南(カンナム)", zh: "江南", zhTw: "江南" },
  "홍대": { en: "Hongdae", ja: "弘大(ホンデ)", zh: "弘大", zhTw: "弘大" },
  "이태원": { en: "Itaewon", ja: "梨泰院(イテウォン)", zh: "梨泰院", zhTw: "梨泰院" },
  "건대": { en: "Konkuk", ja: "建大(コンデ)", zh: "建大", zhTw: "建大" },
  "서울 어디든": { en: "Anywhere in Seoul", ja: "ソウルどこでも", zh: "首尔任意地区", zhTw: "首爾任何地區" },
  "부산": { en: "Busan", ja: "釜山(プサン)", zh: "釜山", zhTw: "釜山" },
  "대구": { en: "Daegu", ja: "大邱(テグ)", zh: "大邱", zhTw: "大邱" },
  "인천": { en: "Incheon", ja: "仁川(インチョン)", zh: "仁川", zhTw: "仁川" },
  "광주": { en: "Gwangju", ja: "光州(クァンジュ)", zh: "光州", zhTw: "光州" },
  "대전": { en: "Daejeon", ja: "大田(テジョン)", zh: "大田", zhTw: "大田" },
  "울산": { en: "Ulsan", ja: "蔚山(ウルサン)", zh: "蔚山", zhTw: "蔚山" },
  "세종": { en: "Sejong", ja: "世宗(セジョン)", zh: "世宗", zhTw: "世宗" },
};

export function areaLabel(area: string, lang: Lang): string {
  if (lang === "ko") return area;
  const m = AREA_I18N[area];
  if (!m) return area;
  if (lang === "ja") return m.ja;
  if (lang === "zh") return m.zh;
  if (lang === "zh-tw") return m.zhTw;
  return m.en;
}

// 언어 선택 UI 공용 상수 (푸터 LangSwitcher · 앱 첫 실행 언어 선택 게이트).
// 각 언어 = 전용 경로 — 네이티브 타이틀·메타데이터·SEO가 심긴 페이지로 보냄.
// href 는 순수 경로여야 함: ?lang= 를 붙이면 (main)/layout 의 isForeigner 판정에
// 걸려 헤더·바텀네비가 통째로 사라진다.
export const LANG_OPTIONS: { lang: Lang; label: string; href: string; flag: string }[] = [
  { lang: "ko",    label: "한국어",      href: "/",       flag: "🇰🇷" },
  { lang: "en",    label: "English",     href: "/en",     flag: "🇺🇸" },
  { lang: "ja",    label: "日本語",      href: "/ja",     flag: "🇯🇵" },
  { lang: "zh",    label: "简体中文",    href: "/zh",     flag: "🇨🇳" },
  { lang: "zh-tw", label: "繁體中文",    href: "/zh-tw",  flag: "🇹🇼" },
];

// 기기(OS) 언어 → Lang. navigator.language 기준.
// 미들웨어 pickForeignRoute() 와 판정이 일치해야 한다 (특히 zh-tw —
// 서버는 번체를 구분하는데 클라이언트가 zh 로 뭉개면 /zh-tw 갔다가 /zh 로 되튕긴다).
export function detectDeviceLang(): Lang {
  const raw = (typeof navigator !== "undefined" ? navigator.language : "") || "en";
  const l = raw.toLowerCase();
  if (l.startsWith("ko")) return "ko";
  if (l.startsWith("ja")) return "ja";
  if (l.startsWith("zh")) {
    // zh-TW · zh-HK · zh-Hant → 번체, 그 외 zh → 간체
    if (l.startsWith("zh-tw") || l.startsWith("zh-hk") || l.startsWith("zh-hant")) return "zh-tw";
    return "zh";
  }
  return "en"; // 그 외 전부 영어 폴백
}

// 앱에서 유저가 명시적으로 고른 언어 (localStorage, 앱 삭제 전까지 유지).
// 기존 nf_lang_pref 는 재사용하지 않는다 — 푸터 드롭다운이 쓰기만 하고
// 아무도 읽지 않던 좀비 키라, 과거에 눌러본 한국 유저의 값이 오염돼 있다.
export const APP_LANG_KEY = "nf_app_lang";

export function readAppLang(): Lang | null {
  try {
    const v = localStorage.getItem(APP_LANG_KEY);
    return v && LANG_OPTIONS.some((o) => o.lang === v) ? (v as Lang) : null;
  } catch {
    return null;
  }
}

export function writeAppLang(lang: Lang): void {
  try {
    localStorage.setItem(APP_LANG_KEY, lang);
  } catch {
    /* noop — iOS 프라이빗 모드 등에서 throw */
  }
}

// 자동 언어 리다이렉트 억제. 억제 장치가 두 곳에 이중으로 있고 저장소가 다르다:
//   - 미들웨어: 쿠키 nf_lang_redirected (6시간)
//   - LangAutoRedirect: sessionStorage 동일 키
// 같은 이름이지만 서로 공유되지 않으므로 반드시 둘 다 세팅해야 한다.
export function suppressAutoLangRedirect(): void {
  try {
    sessionStorage.setItem("nf_lang_redirected", "1");
  } catch {
    /* noop */
  }
  try {
    document.cookie = "nf_lang_redirected=1; path=/; max-age=21600; samesite=lax";
  } catch {
    /* noop */
  }
}
