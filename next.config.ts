import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/puzzles/:path*", destination: "/flags/:path*", permanent: true },
      { source: "/about", destination: "/vision", permanent: true },
      // /flags 인덱스 페이지 없음 → 홈의 깃발 탭(더보기)으로 301.
      // 깃발 더보기 ⋯ 버튼과 동일한 목적지 — 의도 정확 매칭.
      { source: "/flags", destination: "/?tab=puzzle&detail=1", permanent: true },
    ];
  },
  async headers() {
    // Content-Language HTTP 헤더 — Googlebot이 각 URL의 언어를 명확히 판정하도록.
    // 미들웨어에서도 세팅하지만 Vercel 캐시 히트 시 미들웨어가 우회될 수 있어 config 레벨 백업.
    return [
      { source: "/en/:path*", headers: [{ key: "Content-Language", value: "en-US" }] },
      { source: "/en", headers: [{ key: "Content-Language", value: "en-US" }] },
      { source: "/ja/:path*", headers: [{ key: "Content-Language", value: "ja-JP" }] },
      { source: "/ja", headers: [{ key: "Content-Language", value: "ja-JP" }] },
      { source: "/zh-tw/:path*", headers: [{ key: "Content-Language", value: "zh-TW" }] },
      { source: "/zh-tw", headers: [{ key: "Content-Language", value: "zh-TW" }] },
      { source: "/zh/:path*", headers: [{ key: "Content-Language", value: "zh-CN" }] },
      { source: "/zh", headers: [{ key: "Content-Language", value: "zh-CN" }] },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "k.kakaocdn.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        // 시드 데이터용 placeholder 이미지 (와글 SHOT 더미)
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  experimental: {
    // 대량 사용 패키지 트리셰이킹 강화 (lucide-react 200+ 파일, radix-ui 메타패키지, dayjs)
    optimizePackageImports: ["lucide-react", "radix-ui", "dayjs"],
  },

};

// Sentry 설정
const sentryWebpackPluginOptions = {
  // Sentry 프로젝트 설정
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // 소스맵만 업로드 (번들 크기 최적화)
  silent: true,

  // 개발 환경에서는 소스맵 업로드하지 않음
  dryRun: process.env.NODE_ENV === "development",

  // Webpack 플러그인 옵션
  widenClientFileUpload: true,
  hideSourceMaps: true,
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
