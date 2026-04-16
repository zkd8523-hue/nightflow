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
  title: "NightFlow - 클럽 테이블 경매",
  description: "강남·홍대 클럽 테이블을 실시간 경매로",
  openGraph: {
    title: "NightFlow - 클럽 테이블 경매",
    description: "강남·홍대 클럽 테이블을 실시간 경매로",
    url: "https://nightflow-black.vercel.app",
    siteName: "NightFlow",
    locale: "ko_KR",
    type: "website",
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
  return (
    <html lang="ko" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${nanumPen.variable} antialiased`}
      >
        {/* Google AdSense - lazy load (LCP 이후 로드) */}
        <Script
          id="adsense"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6936468170635504"
          strategy="lazyOnload"
          crossOrigin="anonymous"
        />
        {/* PortOne (구 아임포트) 본인인증 SDK */}
        <Script
          id="portone-iamport"
          src="https://cdn.iamport.kr/v1/iamport.js"
          strategy="afterInteractive"
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
