/**
 * 에러 처리 중앙화 유틸리티
 * - Supabase, Fetch API, Axios 등 모든 에러 타입 대응
 * - 개발 환경 전용 상세 로깅
 */

/**
 * 에러 객체에서 사용자에게 표시할 메시지 추출
 * @param error - 알 수 없는 타입의 에러 객체
 * @returns 사용자 친화적인 에러 메시지
 */
export function getErrorMessage(error: unknown): string {
  // 1. 표준 Error 객체
  if (error instanceof Error) {
    return error.message;
  }

  // 2. 문자열 에러
  if (typeof error === 'string') {
    return error;
  }

  // 3. 객체 형태 에러 (Supabase, Fetch API, Axios 등)
  if (error && typeof error === 'object') {
    // Supabase PostgrestError: { message, details, hint, code }
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }

    // Axios 에러: error.response.data.message 또는 .error
    if ('response' in error && error.response && typeof error.response === 'object') {
      const res = error.response as Record<string, unknown>;
      if (res.data && typeof res.data === 'object') {
        const data = res.data as Record<string, unknown>;
        if (data.message && typeof data.message === 'string') return data.message;
        if (data.error && typeof data.error === 'string') return data.error;
      }
    }

    // Fetch API 에러: error.statusText
    if ('statusText' in error && typeof error.statusText === 'string') {
      return error.statusText;
    }
  }

  // 기본 폴백 메시지
  return '알 수 없는 오류가 발생했습니다';
}

/**
 * 개발 환경에서만 상세한 에러 로깅
 * @param error - 에러 객체
 * @param context - 에러 발생 위치/컨텍스트 (예: 'BidPanel.handleBid')
 */
export function logError(error: unknown, context?: string) {
  if (process.env.NODE_ENV === 'development') {
    console.group(`🔴 Error${context ? ` [${context}]` : ''}`);
    console.error(error);

    // 스택 트레이스 출력 (있는 경우)
    if (error && typeof error === 'object' && 'stack' in error) {
      console.error(error.stack);
    }

    console.groupEnd();
  }
}
