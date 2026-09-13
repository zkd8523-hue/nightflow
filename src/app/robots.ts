import type { MetadataRoute } from "next";

// 공통 disallow 경로 — 개인화/관리 페이지는 봇 일괄 차단.
const DISALLOW = [
  "/admin/",
  // /md/[slug] MD 공개 프로필은 색인 허용(검색 유입). 신청 폼만 차단.
  "/md/apply",
  "/api/",
  "/auth/",
  "/settings/",
  "/profile/",
  "/notifications/",
  "/my-wins/",
  "/my-penalties/",
  "/bids/",
  "/favorites/",
  "/recover-account/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // 네이버 검색 로봇(Yeti) 전용 명시 — Naver Search Advisor 가이드 권장.
      // 같은 규칙이지만 명시하면 네이버 봇이 자기 규칙 인식해 우대.
      {
        userAgent: "Yeti",
        allow: "/",
        disallow: DISALLOW,
      },
      // Google 봇 명시 — 옵션, 일관성 위해.
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: DISALLOW,
      },
      // AI 어시스턴트 크롤러 명시 허용(2026-09-14). '*'로도 허용되지만, 명시하면 각 봇이 자기 규칙을
      // 우선 적용하고 "차단 안 됨"이 분명해진다. ChatGPT 검색·Copilot은 Bing 인덱스도 쓰므로 bingbot 포함.
      // 실측: ChatGPT 리퍼러 세션 월 55건(9월), 100만 원 예약 1건 경유.
      {
        userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "ClaudeBot", "Claude-User", "Google-Extended", "bingbot", "Applebot"],
        allow: "/",
        disallow: DISALLOW,
      },
      // 그 외 모든 봇 — 위 명시 봇은 자기 규칙 우선 적용.
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
    ],
    sitemap: "https://nightflow.kr/sitemap.xml",
    host: "https://nightflow.kr",
  };
}
