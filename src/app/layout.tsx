import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Nanum_Pen_Script, Do_Hyeon } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { GoogleAnalytics } from "@/lib/analytics/google-analytics";
import { LoginSuccessTracker } from "@/components/analytics/LoginSuccessTracker";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/layout/OfflineBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const nanumPen = Nanum_Pen_Script({
  weight: "400",
  variable: "--font-nanum-pen",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

// 게스트 간판 라벨 폰트 — 둥글고 친근한 굵은 고딕
const displayKr = Do_Hyeon({
  weight: "400",
  variable: "--font-display-kr",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://nightflow.kr"),
  title: {
    default: "나플 | 나이트플로우",
    template: "%s | 나플",
  },
  description:
    "강남·홍대 클럽 무료입장·조각·테이블 예약·영업시간·주대 정보 한 곳에. 나플 | 나이트플로우.",
  applicationName: "나플",
  keywords: [
    // 브랜드 (3)
    "나플",
    "나이트플로우",
    "NightFlow",
    // 지역 메인 (4)
    "강남 클럽",
    "홍대 클럽",
    "신사 클럽",
    "서울 클럽",
    // 핵심 기능 (5)
    "클럽 테이블 예약",
    "클럽 무료입장",
    "클럽 게스트",
    "클럽 파트너",
    "클럽 추천",
    // 정보형 (4)
    "클럽 드레스코드",
    "클럽 입장료",
    "클럽 프리드링크",
    "클럽 핫플",
  ],
  alternates: {
    canonical: "https://nightflow.kr",
    languages: {
      "ko-KR": "https://nightflow.kr",
      "en-US": "https://nightflow.kr/en",
      "zh-CN": "https://nightflow.kr/zh",
      "zh-TW": "https://nightflow.kr/zh-tw",
      "ja-JP": "https://nightflow.kr/ja",
      "x-default": "https://nightflow.kr",
    },
  },
  openGraph: {
    title: "나플 | 나이트플로우 - 강남·홍대 클럽 정보",
    description:
      "강남·홍대 클럽 무료입장·조각·테이블 예약·영업시간·주대 정보 한 곳에.",
    url: "https://nightflow.kr",
    siteName: "나플",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "나플 | 나이트플로우 - 강남·홍대 클럽 정보",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "나플 | 나이트플로우 - 강남·홍대 클럽 정보",
    description:
      "강남·홍대 클럽 무료입장·조각·테이블 예약·영업시간·주대 정보 한 곳에.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    other: {
      "naver-site-verification": "43d940356195c90cde1de23bc0d9b3b255fe5fa3",
      // Bing Webmaster Tools — Bing/Yahoo/DuckDuckGo 색인 커버
      // (특히 대만 Yahoo Search 점유율 확보용, 홍콩·대만 시장 확장)
      "msvalidate.01": "5113209E7EA8878E25652131C993974E",
      // TODO: Baidu Webmaster (ziyuan.baidu.com) 등록 후 verification 코드 받아 채우기.
      // 중국 본토 검색 트래픽 (Google 차단됨, Baidu 80%+ 점유).
      // "baidu-site-verification": "code_here",
    },
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // iOS는 font-size<16px input에 포커스하면 자동 확대(zoom)돼 레이아웃이 밀린다
  // (검색창이 화면 밖으로 튐). 앱 UX상 핀치줌은 불필요하므로 확대 자체를 차단.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // 키보드가 올라오면 레이아웃 뷰포트도 함께 줄인다(Chrome Android 기본은 resizes-visual라
  // 하단 고정 입력창이 키보드 뒤에 숨음). LIVE 뷰어 메시지 입력·와글 컴포저가 키보드 위로 올라옴.
  interactiveWidget: "resizes-content" as const,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // /en, /ja, /zh, /zh-tw는 각자의 하위 layout에서 자체 JSON-LD와 lang을 사용.
  // 루트에서는 pathname을 보고 <html lang>을 동적으로 결정하고, 한국어 트리에서만 한국어 Organization schema를 노출.
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") || "/";
  // /flags/new, /login 등 언어 경로 프리픽스 없이 ?lang= 쿼리로만 언어를 싣는 공용 라우트 폴백
  // (미들웨어가 x-lang-query로 주입 — 없으면 "ko" 취급, 기존 동작 그대로 유지).
  const langQuery = hdrs.get("x-lang-query") || "";
  const htmlLang =
    pathname.startsWith("/en") || langQuery === "en" ? "en"
    : pathname.startsWith("/zh-tw") || langQuery === "zh-tw" ? "zh-TW"
    : pathname.startsWith("/zh") || langQuery === "zh" ? "zh-CN"
    : pathname.startsWith("/ja") || langQuery === "ja" ? "ja"
    : "ko";
  const isKoreanTree = htmlLang === "ko";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://nightflow.kr/#organization",
        name: "나플",
        alternateName: ["나이트플로우", "NightFlow", "NightFlow Korea"],
        url: "https://nightflow.kr",
        logo: "https://nightflow.kr/og-flag-square.png",
        description:
          "나플은 강남·홍대 클럽 무료입장·조각·테이블 예약·영업시간·주대 정보를 한 곳에서 볼 수 있는 클럽 플랫폼입니다. 밤을 더 아름답게 만드는 무브먼트.",
        slogan: "밤을 더 아름답게",
        sameAs: ["https://www.instagram.com/nightflow.kr/"],
      },
      {
        "@type": "WebSite",
        "@id": "https://nightflow.kr/#website",
        url: "https://nightflow.kr",
        name: "나플",
        alternateName: ["나이트플로우", "NightFlow"],
        inLanguage: "ko-KR",
        publisher: { "@id": "https://nightflow.kr/#organization" },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: "https://nightflow.kr/?q={search_term_string}",
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <html lang={htmlLang} className="dark" suppressHydrationWarning>
      <head>
        {/* 외부 도메인 사전 연결 — DNS+TLS 핸드셰이크를 미리 끝내 첫 API/이미지 응답 단축 */}
        <link rel="preconnect" href="https://ihqztsakxczzsxfvdkpq.supabase.co" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://k.kakaocdn.net" crossOrigin="anonymous" />
        {/* 분석은 LCP 비핵심 — 가벼운 DNS 힌트만 */}
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${nanumPen.variable} ${displayKr.variable} antialiased`}
      >
        {isKoreanTree && (
          <Script
            id="ld-json-organization"
            type="application/ld+json"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        )}
        {/* Google Analytics */}
        <GoogleAnalytics />

        <ErrorBoundary>
          <Providers>
            <Suspense fallback={null}>
              <LoginSuccessTracker />
            </Suspense>
            <OfflineBanner />
            {children}
            <Toaster />
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
