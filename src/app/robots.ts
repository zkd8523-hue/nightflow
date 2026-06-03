import type { MetadataRoute } from "next";

// 공통 disallow 경로 — 개인화/관리 페이지는 봇 일괄 차단.
const DISALLOW = [
  "/admin/",
  "/md/",
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
