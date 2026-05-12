import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 서버 빌드 시 Capacitor 패키지를 빈 모듈로 처리 (브라우저 전용)
      const capacitorPackages = [
        "@capacitor/core",
        "@capacitor/app",
        "@capacitor/browser",
        "@capacitor/push-notifications",
        "@capacitor/haptics",
        "@capacitor/network",
        "@capacitor/preferences",
        "@capacitor/splash-screen",
        "@capacitor/status-bar",
      ];
      capacitorPackages.forEach((pkg) => {
        config.resolve.alias[pkg] = false;
      });
    }
    return config;
  },
  async redirects() {
    return [
      { source: "/puzzles/:path*", destination: "/flags/:path*", permanent: true },
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
    ],
    formats: ["image/avif", "image/webp"],
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
