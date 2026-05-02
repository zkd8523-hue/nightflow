import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Nanum_Pen_Script } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { GoogleAnalytics } from "@/lib/analytics/google-analytics";
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
    default: "나이트플로우(나플) | 강남·홍대 클럽 테이블 실시간 경매",
    template: "%s | 나이트플로우",
  },
  description:
    "나이트플로우(나플) - 강남·홍대 클럽 테이블을 실시간 경매로 예약하세요. 클럽 MD가 직접 올리는 잔여 테이블, 원하는 가격에 입찰하고 낙찰받는 새로운 클럽 예약 플랫폼.",
  applicationName: "NightFlow",
  keywords: [
    "나이트플로우",
    "나플",
    "NightFlow",
    "클럽 테이블 경매",
    "강남 클럽",
    "홍대 클럽",
    "강남 클럽 테이블",
    "홍대 클럽 테이블",
    "클럽 MD",
    "클럽 예약",
    "클럽 테이블 예약",
    "테이블 경매",
    "강남 클럽 예약",
  ],
  alternates: {
    canonical: "https://nightflow.kr",
  },
  openGraph: {
    title: "나이트플로우 (나플) - 클럽 테이블 실시간 경매",
    description: "오늘 밤, 당신의 테이블을 경매로",
    url: "https://nightflow.kr",
    siteName: "NightFlow",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "NightFlow - 클럽 테이블 실시간 경매",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "나이트플로우 (나플) - 클럽 테이블 실시간 경매",
    description: "오늘 밤, 당신의 테이블을 경매로",
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
        name: "NightFlow",
        alternateName: ["나이트플로우", "나플", "NightFlow Korea"],
        url: "https://nightflow.kr",
        logo: "https://nightflow.kr/og-image.png",
        description:
          "강남·홍대 클럽 테이블을 실시간 경매로 예약하는 플랫폼. 클럽 MD가 잔여 테이블을 올리면 유저가 입찰로 가격을 정합니다.",
        sameAs: ["https://www.instagram.com/nightflow.kr/"],
      },
      {
        "@type": "WebSite",
        "@id": "https://nightflow.kr/#website",
        url: "https://nightflow.kr",
        name: "나이트플로우",
        alternateName: ["나플", "NightFlow"],
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
            <OfflineBanner />
            {children}
            <Toaster />
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
