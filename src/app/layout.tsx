import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { Geist, Geist_Mono, Nanum_Pen_Script } from "next/font/google";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://nightflow.kr"),
  title: {
    default: "나플 | 나이트플로우 - 강남·홍대 클럽 테이블 예약",
    template: "%s | 나플 | 나이트플로우",
  },
  description:
    "나플은 전국 인기 클럽 테이블을 실시간 경매로 예약하는 서비스입니다. 강남·홍대·신사 클럽 MD가 잔여 테이블을 올리면 입찰로 가격이 결정됩니다. 혼자 가긴 부담스러우면 퍼즐(클럽 조각·합석)로 일행도 찾을 수 있어요. 강남 Club ACE, 홍대 버뮤다 등 전국 클럽 테이블 가격 비교·예약은 나플에서.",
  applicationName: "나플 | 나이트플로우",
  keywords: [
    "나플",
    "나이트플로우",
    "NightFlow",
    "나플 클럽",
    "나플 예약",
    "나플 강남",
    "나플 홍대",
    "서울 클럽",
    "서울 클럽 예약",
    "서울 클럽 추천",
    "강남 클럽",
    "홍대 클럽",
    "신사 클럽",
    "강남 클럽 예약",
    "홍대 클럽 예약",
    "강남 클럽 추천",
    "홍대 클럽 추천",
    "강남 클럽 테이블",
    "홍대 클럽 테이블",
    "클럽 예약",
    "클럽 테이블 예약",
    "클럽 테이블 경매",
    "클럽 MD",
    "테이블 경매",
    "퍼즐",
    "클럽 퍼즐",
    "클럽 조각",
    "클럽 조각모임",
    "클럽 합석",
    "강남 클럽 조각",
    "홍대 클럽 조각",
    "강남 클럽 합석",
    "홍대 클럽 합석",
    "클럽 일행",
    "클럽 일행 구하기",
    "클럽 메이트",
  ],
  alternates: {
    canonical: "https://nightflow.kr",
  },
  openGraph: {
    title: "나플 | 나이트플로우 - 강남·홍대 클럽 테이블 예약",
    description:
      "강남·홍대·신사 클럽 테이블을 정가보다 저렴하게 예약. MD 직거래, 가격 비교, 실시간 입찰.",
    url: "https://nightflow.kr",
    siteName: "나플 | 나이트플로우",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "나플 | 나이트플로우 - 강남·홍대 클럽 테이블 예약",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "나플 | 나이트플로우 - 강남·홍대 클럽 테이블 예약",
    description:
      "강남·홍대·신사 클럽 테이블을 정가보다 저렴하게 예약. MD 직거래, 가격 비교, 실시간 입찰.",
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
    },
  },
  other: {
    "google-adsense-account": "ca-pub-6936468170635504",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://nightflow.kr/#organization",
        name: "나플",
        alternateName: ["나이트플로우", "NightFlow", "NightFlow Korea"],
        url: "https://nightflow.kr",
        logo: "https://nightflow.kr/og-image.png",
        description:
          "나플은 전국 인기 클럽 테이블을 실시간 경매로 예약하는 서비스. 강남·홍대·신사 등 클럽 MD가 잔여 테이블을 올리면 유저가 입찰로 가격을 정합니다. 나플은 밤을 더 아름답게 만드는 무브먼트입니다.",
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
    <html lang="ko" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${nanumPen.variable} antialiased`}
      >
        <Script
          id="ld-json-organization"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Google AdSense - lazy load (LCP 이후 로드) */}
        <Script
          id="adsense"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6936468170635504"
          strategy="lazyOnload"
          crossOrigin="anonymous"
        />
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
