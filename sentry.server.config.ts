import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 트레이싱 설정
  tracesSampleRate: process.env.NODE_ENV === "development" ? 0 : 1.0,

  // 디버그 모드 (개발 환경에서만)
  debug: process.env.NODE_ENV === "development",

  // 환경 설정
  environment: process.env.NODE_ENV,

  // 에러 필터링
  beforeSend(event, hint) {
    // 개발 환경에서는 Sentry로 전송하지 않음
    if (process.env.NODE_ENV === "development") {
      console.error(hint.originalException || hint.syntheticException);
      return null;
    }
    return event;
  },

  // 서버 에러만 필터링
  ignoreErrors: [
    // Supabase 일시적 오류
    "PGRST",
    // Next.js 내부 에러
    "NEXT_NOT_FOUND",
  ],
});
