import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 트레이싱 설정
  tracesSampleRate: process.env.NODE_ENV === "development" ? 0 : 1.0,

  // 디버그 모드 (개발 환경에서만)
  debug: process.env.NODE_ENV === "development",

  // 환경 설정
  environment: process.env.NODE_ENV,

  // 세션 재생 비활성화 (MVP 단계에서 불필요, ~50KB 번들 절감)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // 에러 필터링
  beforeSend(event, hint) {
    // 개발 환경에서는 Sentry로 전송하지 않음
    if (process.env.NODE_ENV === "development") {
      console.error(hint.originalException || hint.syntheticException);
      return null;
    }
    return event;
  },

  // 무시할 에러
  ignoreErrors: [
    // 네트워크 에러
    "NetworkError",
    "Network request failed",
    "Failed to fetch",
    // 브라우저 확장 프로그램
    "Non-Error promise rejection captured",
    // React Hydration (일시적 오류)
    "Hydration failed",
    "There was an error while hydrating",
  ],
});
