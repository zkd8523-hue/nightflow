'use client';

import Script from 'next/script';
import { logger } from '@/lib/utils/logger';

// Google Analytics gtag 함수 타입 정의
type GtagFunction = (
  command: 'event' | 'config' | 'js' | 'set',
  ...args: unknown[]
) => void;

declare global {
  interface Window {
    gtag?: GtagFunction;
    dataLayer?: unknown[];
  }
}

export function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  // Google Ads 전환 태그(AW-...). GA4와 같은 gtag.js를 공유하므로
  // 스크립트를 새로 로드하지 않고 config 한 줄만 더 붙인다.
  // 없으면 GA4만 정상 동작하고 Ads 전환만 조용히 빠진다.
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

  if (!measurementId) {
    logger.warn('Google Analytics Measurement ID is not set');
    return null;
  }

  if (!adsId) {
    logger.warn('Google Ads ID is not set — 전환 추적이 비활성화됩니다');
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', {
            page_path: window.location.pathname,
          });
          ${adsId ? `gtag('config', '${adsId}');` : ''}
        `}
      </Script>
    </>
  );
}
