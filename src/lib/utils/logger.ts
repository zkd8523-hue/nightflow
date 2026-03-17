/**
 * 개발 환경 전용 로거 유틸리티
 *
 * 프로덕션 환경에서는 로그를 출력하지 않으며,
 * 개발 환경에서만 콘솔에 로그를 출력합니다.
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
  /**
   * 일반 로그 출력 (개발 환경 전용)
   */
  log: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * 에러 로그 출력 (개발 환경 전용)
   */
  error: (...args: unknown[]) => {
    if (isDevelopment) {
      console.error(...args);
    }
  },

  /**
   * 경고 로그 출력 (개발 환경 전용)
   */
  warn: (...args: unknown[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  /**
   * 컨텍스트와 함께 로그 출력 (개발 환경 전용)
   */
  logWithContext: (context: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.log(`[${context}]`, ...args);
    }
  },

  /**
   * 컨텍스트와 함께 에러 로그 출력 (개발 환경 전용)
   */
  errorWithContext: (context: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.error(`[${context}]`, ...args);
    }
  },
};
