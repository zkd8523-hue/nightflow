// 다국어 hreflang 헬퍼.
// Google에 "이 페이지의 다른 언어 버전은 여기"를 알려서
// (1) 중복 콘텐츠 페널티 회피 (2) 다국어 검색 결과 매칭 정확도 ↑
//
// 사용:
//   alternates: {
//     canonical: "https://nightflow.kr/en/vip-tables",
//     languages: hreflangFor({ subpath: "/vip-tables", langs: ["en", "zh", "ja"] }),
//   }
//
// 한국어 페이지가 있으면 langs에 "ko" 추가. subpath는 lang prefix 없는 경로 ("/vip-tables").
// 메인은 subpath="" (또는 "/").

const BASE = "https://nightflow.kr";

export type SeoLang = "ko" | "en" | "zh" | "ja";

interface HreflangOpts {
  subpath: string; // "/vip-tables", "/clubs/gangnam", "" (메인)
  langs: SeoLang[]; // 이 페이지가 존재하는 언어들
}

export function hreflangFor({ subpath, langs }: HreflangOpts): Record<string, string> {
  const sub = subpath === "/" ? "" : subpath;
  const result: Record<string, string> = {};

  if (langs.includes("ko")) {
    result["ko-KR"] = `${BASE}${sub || "/"}`;
  }
  if (langs.includes("en")) {
    result["en-US"] = `${BASE}/en${sub}`;
  }
  if (langs.includes("zh")) {
    // 중국어 간체·번체 같은 페이지로 매핑 (콘텐츠는 간체로 작성됨)
    result["zh-CN"] = `${BASE}/zh${sub}`;
    result["zh-TW"] = `${BASE}/zh${sub}`;
  }
  if (langs.includes("ja")) {
    result["ja-JP"] = `${BASE}/ja${sub}`;
  }

  // x-default — 언어 미매칭 시 폴백. 한국어 있으면 ko, 없으면 en.
  if (langs.includes("ko")) {
    result["x-default"] = `${BASE}${sub || "/"}`;
  } else if (langs.includes("en")) {
    result["x-default"] = `${BASE}/en${sub}`;
  }

  return result;
}
